import nclexAttemptModel from '../../../Models/nclexAttempt.js';
import { generateNclexItem, generateNclexCaseStudy } from '../../../utilities/nclexGenerator.js';

// Helper function to get the next item
const getNextItem = async (attempt, lastResponse = null) => {
    const itemsAnswered = attempt.state.total_items_answered;
    const n = itemsAnswered + 1; // 1-indexed next item number
    const starts = [15, 45, 75]; // when to trigger case studies
    const completedCaseStudies = attempt.state.completed_case_studies;
    const caseItemsDelivered = attempt.state.case_study_items_delivered;

    // Check if we are currently serving a case study
    if (caseItemsDelivered > 0 && caseItemsDelivered < 6 && attempt.state.active_case_study_data) {
        const caseData = attempt.state.active_case_study_data;
        const screen = caseData.screens[caseItemsDelivered];
        
        attempt.state.case_study_items_delivered += 1;
        if (attempt.state.case_study_items_delivered === 6) {
            attempt.state.completed_case_studies += 1;
            attempt.state.case_study_items_delivered = 0; // Reset for the next one
            attempt.state.active_case_study_data = null; // Free up space
        }

        return {
            caseId: caseData.caseStudyId,
            caseTitle: caseData.caseTitle,
            tabs: caseData.recordTabs,
            screen: screen.screenNumber,
            itemId: `${caseData.caseStudyId}-${screen.screenNumber}`,
            questionType: screen.questionType,
            question: screen.question,
            options: screen.options,
            correctAnswer: screen.correctAnswer,
            rationale: screen.rationale
        };
    }

    // Check if we need to START a case study
    if (completedCaseStudies < 3 && n >= starts[completedCaseStudies] && caseItemsDelivered === 0) {
        const aiResponse = await generateNclexCaseStudy({
            ...attempt.state.toObject(),
            history: [] // Simplify for case study generation
        });

        attempt.state.active_case_study_data = aiResponse;
        attempt.state.active_case_study_id = aiResponse.caseStudyId;
        attempt.state.case_study_items_delivered = 1;

        const screen = aiResponse.screens[0];
        
        return {
            caseId: aiResponse.caseStudyId,
            caseTitle: aiResponse.caseTitle,
            tabs: aiResponse.recordTabs,
            screen: screen.screenNumber,
            itemId: `${aiResponse.caseStudyId}-${screen.screenNumber}`,
            questionType: screen.questionType,
            question: screen.question,
            options: screen.options,
            correctAnswer: screen.correctAnswer,
            rationale: screen.rationale
        };
    }

    // Otherwise generate a standalone item
    const administeredTopics = attempt.history.map((entry) => {
        const q = entry.question;
        const ans = Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer;
        return `Topic/Q: ${(q.question || '').substring(0, 150)}... | Answer: ${ans}`;
    });

    const currentStateData = {
        ...attempt.state.toObject(),
        administeredTopics
    };

    if (lastResponse) {
        currentStateData.lastResponse = lastResponse;
    }

    const aiResponse = await generateNclexItem(currentStateData);
    
    // ─── Server-side IRT theta update (EAP / Newton-Raphson approximation) ───
    // We do NOT trust the AI to update theta — we compute it ourselves from 
    // the full response history to prevent hallucinated/falsified scores.
    const history = attempt.history;
    if (history.length > 0) {
        // Collect all response values and difficulty estimates from history
        const responses = history.map(h => h.responseValue ?? (h.isCorrect ? 1.0 : 0.0));
        const difficulties = history.map(h => {
            const d = h.question?.estimatedDifficultyLogit;
            return (typeof d === 'number' && !isNaN(d)) ? d : 0.0;
        });

        // Newton-Raphson MLE for theta (up to 20 iterations)
        let theta = attempt.state.theta ?? -0.25;
        for (let iter = 0; iter < 20; iter++) {
            let first = 0, second = 0;
            for (let i = 0; i < responses.length; i++) {
                const p = 1 / (1 + Math.exp(-(theta - difficulties[i])));
                const pq = p * (1 - p);
                first += responses[i] - p;
                second -= pq;
            }
            if (Math.abs(second) < 1e-10) break;
            const delta = first / second;
            theta -= delta;
            // Bound theta to [-4, 4] logits (realistic NCLEX range)
            theta = Math.max(-4, Math.min(4, theta));
            if (Math.abs(delta) < 0.001) break;
        }

        // Fisher information for standard error
        let information = 0;
        for (let i = 0; i < difficulties.length; i++) {
            const p = 1 / (1 + Math.exp(-(theta - difficulties[i])));
            information += p * (1 - p);
        }
        const se = information > 0 ? 1 / Math.sqrt(information) : 1.0;

        attempt.state.theta = theta;
        attempt.state.standard_error = Math.min(se, 1.5); // cap at 1.5
    } else {
        // Fallback for very first item — trust AI for initial estimate only
        if (typeof aiResponse.newState?.theta === 'number') {
            attempt.state.theta = Math.max(-4, Math.min(4, aiResponse.newState.theta));
        }
    }

    return aiResponse.nextItem;
};

export const startNclexSimulationService = async (userId) => {
    // End any existing attempts by setting them to abandoned
    await nclexAttemptModel.updateMany(
        { userId, status: 'in-progress' },
        { $set: { status: 'abandoned', decisionRule: 'User started new simulator' } }
    );

    let attempt = new nclexAttemptModel({
        userId,
        status: 'in-progress',
        state: {
            theta: -0.25,
            standard_error: 1.00,
            total_items_answered: 0,
            completed_case_studies: 0,
            pretest_items_answered: 0,
            elapsed_seconds: 0,
            case_study_items_delivered: 0
        },
        history: []
    });
    await attempt.save();

    // Use our new helper
    const nextItem = await getNextItem(attempt);
    await attempt.save();

    return {
        attemptId: attempt._id,
        status: attempt.status,
        nextItem: nextItem,
        currentQuestionNumber: attempt.state.total_items_answered + 1
    };
};

export const submitNclexAnswerService = async (attemptId, question, userAnswer, elapsedSeconds) => {
    const attempt = await nclexAttemptModel.findById(attemptId);
    if (!attempt || attempt.status !== 'in-progress') {
        throw new Error("Invalid or completed NCLEX simulation attempt.");
    }

    // Determine correctness
    let isCorrect = false;
    let responseValue = 0;

    if (question.questionType === 'SATA') {
        let correctOptions = [];
        try {
            correctOptions = Array.isArray(question.correctAnswer) ? question.correctAnswer : JSON.parse(question.correctAnswer);
        } catch(e) {
            correctOptions = [question.correctAnswer];
        }
        
        const userOptions = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
        isCorrect = correctOptions.length === userOptions.length && correctOptions.every(opt => userOptions.includes(opt));
        
        // Plus/Minus scoring for SATA
        let correctSelections = userOptions.filter(opt => correctOptions.includes(opt)).length;
        let incorrectSelections = userOptions.filter(opt => !correctOptions.includes(opt)).length;
        let score = Math.max(0, correctSelections - incorrectSelections);
        responseValue = correctOptions.length > 0 ? score / correctOptions.length : 0;
    } else {
        isCorrect = question.correctAnswer === userAnswer;
        responseValue = isCorrect ? 1.0 : 0.0;
    }

    attempt.history.push({
        question,
        userAnswer,
        isCorrect,
        responseValue
    });

    attempt.state.elapsed_seconds += (elapsedSeconds || 60);
    attempt.state.total_items_answered += 1;

    // Count this day + lifetime questions/accuracy for Progress
    try {
        const { recordStudyActivityService } = await import(
            "../StudyActivity/StudyActivityService.js"
        );
        await recordStudyActivityService(attempt.userId, "nclex", {
            isCorrect,
            topicTitle: question?.category || question?.topic || "NCLEX",
            userAnswer: Array.isArray(userAnswer) ? userAnswer.join(", ") : String(userAnswer ?? ""),
            timeSpentSeconds: elapsedSeconds || 60,
        });
    } catch (e) {
        console.error("Failed to record study activity after NCLEX answer:", e);
    }

    // Hard enforcement of NCLEX Stopping Rules BEFORE generating next item
    const itemsAnswered = attempt.state.total_items_answered;
    const totalElapsedSeconds = attempt.state.elapsed_seconds;
    const theta = attempt.state.theta;
    const se = attempt.state.standard_error;

    const lowerBound = theta - (1.96 * se);
    const upperBound = theta + (1.96 * se);

    let finalStatus = 'in-progress';
    let finalDecisionRule = null;

    if (totalElapsedSeconds >= 18000) {
        if (itemsAnswered < 85) {
            finalStatus = 'fail';
        } else {
            finalStatus = theta >= 0 ? 'pass' : 'fail';
        }
        finalDecisionRule = 'Time-Limit Rule';
    } 
    else if (itemsAnswered >= 150) {
        finalStatus = theta >= 0 ? 'pass' : 'fail';
        finalDecisionRule = 'Maximum-Length Rule';
    } 
    else if (itemsAnswered >= 85 && attempt.state.completed_case_studies >= 3) {
        if (lowerBound > 0) {
            finalStatus = 'pass';
            finalDecisionRule = '95% Confidence Rule';
        } else if (upperBound < 0) {
            finalStatus = 'fail';
            finalDecisionRule = '95% Confidence Rule';
        }
    }

    let nextItem = null;

    if (finalStatus !== 'in-progress') {
        attempt.status = finalStatus;
        attempt.decisionRule = finalDecisionRule;
    } else {
        // Only generate next item if we are continuing
        nextItem = await getNextItem(attempt, {
            isCorrect,
            responseValue,
            userAnswer
        });
    }

    await attempt.save();

    return {
        status: attempt.status,
        decisionRule: attempt.decisionRule,
        nextItem: nextItem,
        currentQuestionNumber: attempt.state.total_items_answered + 1
    };
};
