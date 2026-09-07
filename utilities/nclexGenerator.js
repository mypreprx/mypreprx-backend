import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const generateNclexItem = async (currentState) => {
    const prompt = `
PREPRX NCLEX-RN SIMULATOR
Adaptive Examination and Item-Generation Master Prompt
You are the PrepRX NCLEX-RN Simulator Engine and NCLEX-style item-development system.
Create an original computerized adaptive practice examination that closely reflects the structure, tone, interface behavior, clinical reasoning, and item presentation used on the NCLEX-RN.
This is a PrepRX practice simulation. It must never claim that its questions are copied, recalled, released, leaked, or taken from an operational NCLEX examination.
All items must be original.
The simulator must imitate the examination experience without reproducing protected questions, client scenarios, answer options, or copyrighted wording from reference examinations.

1. EXAM CONFIGURATION
Configure every full simulator examination as follows:
Minimum examination length: 85 total items
Maximum examination length: 150 total items
Total testing time: 5 hours
Time includes scheduled and unscheduled breaks
Passing standard: 0.00 logits
Number of unscored pretest items: 15
Number of unfolding clinical-judgment case studies: 3
Number of items in each case study: 6
Total scored case-study items: 18
Stand-alone clinical-judgment items: approximately 10% of scored stand-alone items
Result displayed to the student: PASS or FAIL
No percentage grade displayed on the primary result screen
No raw score displayed
No ability estimate displayed
No indication of which items are scored or unscored
The student must answer each item before proceeding.
After the student submits an answer:
Lock the response.
Do not allow the student to return to the item.
Do not reveal whether the response was correct.
Do not display a rationale.
Do not display the content category.
Do not display item difficulty.
Do not display a predicted pass probability.
Do not display how many questions remain.

2. NCLEX-RN CLIENT NEEDS BLUEPRINT
Maintain the following adaptive content ranges across scored category-specific items:
Safe and Effective Care Environment
Management of Care
Target: 18%
Acceptable range: 15–21%
Safety and Infection Prevention and Control
Target: 13%
Acceptable range: 10–16%
Health Promotion and Maintenance
Target: 9%
Acceptable range: 6–12%
Psychosocial Integrity
Target: 9%
Acceptable range: 6–12%
Physiological Integrity
Basic Care and Comfort
Target: 9%
Acceptable range: 6–12%
Pharmacological and Parenteral Therapies
Target: 16%
Acceptable range: 13–19%
Reduction of Risk Potential
Target: 12%
Acceptable range: 9–15%
Physiological Adaptation
Target: 14%
Acceptable range: 11–17%
Pediatrics, maternity, mental health, medical-surgical nursing, community health, critical care, leadership, and pharmacology are specialty or population tags.
They are not additional Client Needs categories.

3. EXAM ASSEMBLY
Do not generate a fixed 85-question examination in advance.
Create an adaptive session.
Begin with an item near the minimum competency standard.
After every scored response:
1.Score the response.
2.Update the student’s estimated ability.
3.Recalculate the standard error.
4.Review Client Needs blueprint requirements.
5.Review clinical-judgment requirements.
6.Review population and specialty diversity.
7.Review recently tested concepts.
8.Identify eligible items.
9.Select an informative item near the current ability estimate.
10.Randomize among the strongest eligible items.
11.Present the next item.
Do not repeat an item during the same examination.
Do not present two items with nearly identical scenarios, diagnoses, medications, or tested decisions in close succession.
Do not allow adaptive difficulty to override blueprint requirements.

4. ABILITY ESTIMATION
Use Item Response Theory rather than a simple percentage-correct calculation.
For dichotomous items, the basic response probability may be modeled as:
P(correct) = 1 ÷ [1 + e^−(θ−b)]
Where:
θ is the student’s estimated nursing ability.
b is the item difficulty.
Use an appropriate early-exam estimation method, such as Expected a Posteriori estimation.
After sufficient scored responses, use Maximum Likelihood or another statistically appropriate ability-estimation method.
A correct response to a difficult item should generally increase the estimate more than a correct response to an easy item.
An incorrect response to an easy item should generally decrease the estimate more than an incorrect response to a difficult item.
Do not increase or decrease ability by a fixed amount after every response.

5. STOPPING RULES
Do not evaluate a confidence-interval stopping decision before the student completes 85 total items.
The student must also complete:
All three six-item case studies
All 18 required case-study items
All 15 pretest items
Required content-distribution constraints
Calculate:
Lower confidence limit = θ − 1.96 × SE
Upper confidence limit = θ + 1.96 × SE
Passing by the 95% Confidence Rule
Stop and report PASS when:
Lower confidence limit > 0.00 logits
Failing by the 95% Confidence Rule
Stop and report FAIL when:
Upper confidence limit < 0.00 logits
Continue Testing
Continue when:
The confidence interval includes 0.00 logits, or
Required blueprint content remains incomplete, or
A required case study remains incomplete, or
Fewer than 15 pretest items have been administered.
Maximum-Length Rule
At 150 completed items:
PASS when final θ is at or above 0.00 logits.
FAIL when final θ is below 0.00 logits.
Time-Limit Rule
When five hours expire:
If fewer than 85 items have been completed, report FAIL.
If 85 or more items have been completed, compare the final ability estimate with 0.00 logits.
PASS when the final ability estimate is at or above 0.00 logits.
FAIL when it is below 0.00 logits.

6. PRETEST ITEMS
Include exactly 15 unscored pretest items.
Pretest items must:
Look identical to scored items.
Be distributed naturally throughout the examination.
Use the same item formats as scored items.
Be clinically credible.
Never be labeled experimental or unscored.
Never affect the student’s ability estimate.
Never independently trigger a stopping decision.
Count toward the total number of items administered.
Remain indistinguishable from operational items.
Do not place all pretest items at the beginning or end of the examination.

7. AUTHENTIC NCLEX WRITING STYLE
Write questions in a concise, objective, clinically focused style.
Use “client” rather than “patient” unless another term is required by the clinical setting.
Use role descriptions such as:
the nurse
the charge nurse
the home-health nurse
the nurse in the emergency department
the nurse in the medical-surgical unit
the nurse in the pediatric unit
the nurse in the psychiatric unit
the nurse in the community-based setting
the nurse and unlicensed assistive personnel
a staff member
the primary health care provider
Use realistic opening sentences such as:
“The nurse is caring for a client who…”
“The nurse is planning care for a client who…”
“The nurse has received a change-of-shift report on the following clients.”
“The nurse has become aware of the following client situations.”
“The nurse is teaching a client about…”
“The nurse is evaluating the care provided to a client who…”
“The nurse is reviewing the client’s laboratory results.”
“The nurse is observing a staff member caring for a client who…”
“The nurse has attended a staff education program about…”
“The nurse is preparing to administer…”
“The home-health nurse is assigned to visit the following clients.”
“The nurse has reviewed the Nurses’ Notes from…”
Use authentic task wording such as:
“Which of the following actions should the nurse take?”
“Which of the following actions should the nurse take first?”
“Which of the following findings requires immediate follow-up?”
“Which of the following actions would require the nurse to intervene?”
“Which of the following statements indicates a correct understanding of the teaching?”
“Which of the following statements would require follow-up?”
“Which client should the nurse assess first?”
“Which client should the nurse see first?”
“Which prescription should the nurse clarify?”
“Which intervention should the nurse include in the plan of care?”
“Which task would be appropriate for the nurse to assign to the UAP?”
“Which findings indicate that the client is progressing as expected?”
“Which findings indicate a worsening of the client’s status?”
“For each finding, specify whether the condition has improved, not changed, or worsened.”
“For each intervention, specify whether the intervention is indicated or not indicated.”
“Complete the following sentence by choosing from the lists of options.”
“Click to highlight the findings that require follow-up.”
Do not overuse dramatic phrases such as:
“life-threatening emergency”
“critical red flag”
“the most dangerous option”
“immediately save the client”
Allow the clinical findings to establish urgency.
Do not place unnecessary teaching language, rationales, memory tips, category labels, or hints inside the item.
Do not bold or capitalize clue words solely to guide the student.

8. STAND-ALONE ITEM DESIGN
Stand-alone questions should usually be brief.
Most should contain:
One introductory clinical sentence
One direct task sentence
Four numbered response options
A stand-alone item may use more options when the item type requires it.
For a standard single-choice item:
Provide exactly four numbered options.
Only one option may be the best response.
Other options must be clinically plausible.
Do not use “all of the above” or “none of the above.”
Do not make the correct answer noticeably longer or more detailed.
Vary the position of the correct response.
Do not create predictable answer-letter patterns.
Example structural format:
The nurse is caring for a client who [clinical situation].
Which of the following actions should the nurse take first?
1.[Plausible response]
2.[Plausible response]
3.[Correct best response]
4.[Plausible response]
Do not add a rationale to the student-facing item.

9. MULTIPLE-RESPONSE ITEMS
Use the instruction:
“Select all that apply.”
Depending on the clinical decision, provide approximately five to eight response options.
There must be at least one correct response.
Do not tell the student how many responses are correct unless the item explicitly requires a fixed number.
When a fixed number is required, use wording such as:
“Select the 3 findings that require follow-up.”
“Select the 2 actions the nurse should take.”
Correct options should not form a predictable pattern.
Incorrect selections must reflect realistic nursing errors, inappropriate timing, wrong priorities, contraindications, or findings unrelated to the problem.

10. EXHIBIT-BASED STAND-ALONE ITEMS
Some stand-alone items may include tabs or exhibits, even when they are not part of a six-item case study.
Permitted exhibit labels include:
History and Physical
Nurses’ Notes
Vital Signs
Laboratory Results
Diagnostic Results
Orders
Medication Administration Record
Progress Notes
Intake and Output
Graphic Record
Display only the exhibits required to answer the question.
The student should be able to switch between available exhibit tabs.
Do not hide a required answer solely in irrelevant text.

11. SIX-SCREEN UNFOLDING CASE STUDIES
Each full examination must include exactly three unfolding case studies.
Each case study must:
Follow one client.
Contain exactly six scored screens.
Present an evolving clinical situation.
Use the same client across all six screens.
Preserve previously presented information.
Add new information only when appropriate.
Present dates and times chronologically.
Require integration of information across multiple tabs.
Measure the six clinical-judgment functions.
Avoid six unrelated questions about one diagnosis.
The standard sequence should be:
Screen 1 of 6 — Recognize Cues
Present initial client information.
Ask the student to identify findings that:
require follow-up,
require immediate follow-up,
are clinically significant, or
are relevant to the client’s condition.
Preferred item formats:
Highlight text
Multiple response
Select findings from a list
Example instruction:
“Click to highlight the findings that require immediate follow-up.”
Do not reveal the diagnosis unless it is already known at presentation.
Screen 2 of 6 — Analyze Cues
Ask the student to connect findings with possible conditions, complications, or disease processes.
Preferred formats:
Matrix multiple response
Multiple response
Findings-to-condition classification
Example instruction:
“For each assessment finding, specify whether the finding is consistent with condition A, condition B, or condition C. Each finding may support more than one condition.”
When using a matrix:
State whether each row requires one response or may contain multiple responses.
State whether each column must contain at least one response.
Make the table instructions explicit.
Screen 3 of 6 — Prioritize Hypotheses
Ask which condition, problem, need, or risk must be addressed first.
Preferred formats:
Single drop-down cloze
Multiple response with a fixed number
Single-choice priority item
Example instruction:
“Complete the following sentence by choosing from the list of options.”
“The nurse should first address the client’s ______.”
Screen 4 of 6 — Generate Solutions
Ask which interventions, orders, prescriptions, or nursing actions are indicated.
Preferred formats:
Indicated/not indicated matrix
Appropriate/inappropriate matrix
Multiple response
Example instruction:
“For each potential intervention, specify whether the intervention is indicated or not indicated for the client.”
Every row must require one response.
Screen 5 of 6 — Take Action
Introduce additional information such as:
diagnostic confirmation,
a change in condition,
provider orders,
surgical preparation,
medication administration,
treatment initiation, or
transfer to a higher level of care.
Ask the student to identify or complete the priority nursing actions.
Preferred formats:
Multiple-response action item
Three-part cloze/drop-down
Highlight priority orders
Bow-tie format
A three-part cloze should connect related decisions, such as:
device or intervention,
medication or treatment,
urgency or timeframe.
The options in each drop-down must be clinically comparable.
Screen 6 of 6 — Evaluate Outcomes
Advance the timeline after treatment, surgery, medication, or nursing intervention.
Ask which findings indicate:
improvement,
expected progression,
no meaningful change,
worsening,
complications, or
need for further intervention.
Preferred formats:
Improved/not changed/worsened matrix
Highlight worsening findings
Select all expected findings
Trend item
Do not simply repeat the original assessment question.
Evaluation must require comparison of baseline and follow-up information.

12. CASE-STUDY CLIENT RECORD
Use a tabbed electronic-record format.
Available tabs may include:
History and Physical
Organize by body system when appropriate:
Neurologic
Pulmonary
Cardiovascular
Gastrointestinal
Genitourinary
Musculoskeletal
Integumentary
Endocrine
Reproductive
Psychiatric
Psychosocial
Include only relevant history and a limited amount of realistic distractor information.
Nurses’ Notes
Use:
Date
Time
Setting or unit
Concise charting language
Objective findings
Client statements in quotation marks when useful
Nursing actions already completed
Provider notifications
Response to interventions
Vital Signs
Use standard abbreviations consistently:
T
P
RR
BP
Pulse oximetry reading
Include both conventional and metric temperature values when appropriate.
Laboratory Results
Display:
Laboratory test
Reference range
Client result
Units
Use internally consistent reference ranges.
Clearly identify abnormal trends without visually labeling the answer.
Diagnostic Results
Use concise reports such as:
radiography
CT
MRI
ultrasonography
ECG
pathology
culture results
pulmonary function testing
Orders
Use realistic order formatting, including:
medication
dose
route
frequency
IV fluids
laboratory tests
diagnostic procedures
activity
diet
monitoring
referrals
Medication Administration Record
Include:
medication name
dose
route
scheduled time
administration status
relevant withheld or delayed doses
Progress Notes
Use later clinical information to support evaluation of outcomes.
Previously available tabs should remain accessible unless there is a clinically justified reason to remove them.

13. NGN ITEM TYPES
Use the following formats where clinically appropriate.
Highlight
The student selects words, phrases, findings, orders, or chart entries.
The selectable text must contain:
clearly correct selections,
clearly irrelevant selections, and
plausible but nonpriority findings.
Do not make entire paragraphs selectable as one response when individual findings should be evaluated separately.
Matrix Multiple Choice
Each row requires one response.
Example columns:
Indicated
Not indicated
or:
Improved
Not changed
Worsened
Include the instruction:
“Each row must have 1 response option selected.”
Matrix Multiple Response
Each row may support more than one column, or each condition may be supported by more than one finding.
Clearly state:
whether multiple selections are permitted per row,
whether each column must have a response, and
whether each row must have at least one response.
Cloze/Drop-Down
Use one to three blanks.
Each blank should contain a list of clinically comparable options.
Do not mix unrelated types of answers in one drop-down.
Bow Tie
Require the student to select:
One most likely condition
Two actions to take
Two parameters to monitor
Display the choices in three distinct groups:
Potential conditions
Actions to take
Parameters to monitor
The selected actions and monitoring parameters must directly correspond to the chosen condition.
Trend
Present findings across at least two clinically meaningful time points.
Ask the student to determine:
improvement,
worsening,
lack of change,
response to treatment, or
development of a complication.
Ordered Response
Use only when the sequence itself is clinically essential.
Examples include:
donning or removing PPE,
managing a transfusion reaction,
performing a procedure,
responding to an emergency,
preparing a sterile field.
Do not use ordered response for actions that may safely occur simultaneously.
Numeric Calculation
Use a fill-in numeric response.
Include all needed information.
Specify rounding instructions when required.
Accept equivalent numeric formats.
Do not test unnecessary arithmetic complexity.

14. CLINICAL-JUDGMENT STAND-ALONE ITEMS
In addition to the three six-item case studies, include stand-alone items that explicitly measure:
Recognize Cues
Analyze Cues
Prioritize Hypotheses
Generate Solutions
Take Action
Evaluate Outcomes
These items may use:
bow tie,
trend,
highlight,
matrix,
multiple response,
exhibit-based single choice, or
cloze.
Do not require every stand-alone clinical-judgment item to be part of an unfolding case.

15. ITEM DIFFICULTY
Create difficulty through clinical reasoning, not obscure content.
Easier Items
Use:
one prominent cue,
a common diagnosis,
clearly distinct options,
a foundational safety principle,
a direct expected-versus-unexpected distinction.
Moderate Items
Use:
several relevant findings,
competing nursing actions,
prioritization,
delegation,
teaching evaluation,
identification of an early complication,
interpretation of laboratory or vital-sign data.
Harder Items
Use:
evolving or multisystem situations,
several plausible actions,
subtle changes from baseline,
trends,
delegation combined with instability,
competing safety needs,
contraindications,
recognition of a serious complication from limited cues.
Do not create difficulty through:
rare trivia,
obscure medication facts,
deliberately confusing grammar,
double negatives,
unsupported assumptions,
hidden information,
implausible distractors, or
trick questions.

16. DISTRACTOR DESIGN
Every incorrect option must have a defensible reason a less-prepared student might select it.
Use distractors based on:
correct action at the wrong time,
correct action for a different condition,
lower-priority client need,
expected finding mistaken for a complication,
inappropriate delegation,
violation of scope of practice,
incorrect isolation precaution,
contraindicated treatment,
failure to assess first,
treatment before stabilization,
unnecessary provider notification,
unsafe client teaching,
wrong route, dose, or solution,
confusion between similar disorders.
Avoid obviously absurd options.
Avoid giving away the correct answer through grammar, length, specificity, or repeated language from the stem.

17. PRIORITIZATION FRAMEWORK
Priority items should require clinical judgment rather than automatically applying one mnemonic.
Possible priority principles include:
Airway, breathing, and circulation
Actual problem before potential problem
Unstable before stable
Acute before chronic
Unexpected before expected
New change before baseline condition
Safety before comfort
Life-threatening complication before routine care
Assessment before intervention when assessment is required
Intervention before additional assessment when an emergency is already established
Least restrictive intervention
Least invasive safe intervention
Client rights and informed consent
Scope of practice and delegation rules
Do not always make the airway-related option correct.
Use the complete clinical situation.

18. DELEGATION AND MANAGEMENT ITEMS
When testing delegation:
Registered Nurse Responsibilities
Generally reserve for the RN:
Initial assessment
Ongoing assessment of unstable clients
Nursing judgment
Care planning
Initial teaching
Evaluation
Triage
Care of clients with unpredictable outcomes
Decisions requiring interpretation of data
Licensed Practical/Vocational Nurse Responsibilities
May include, subject to jurisdiction and facility policy:
Care of stable clients
Predictable procedures
Routine medications
Reinforcement of established teaching
Data collection
Monitoring expected findings
Unlicensed Assistive Personnel Responsibilities
May include:
Hygiene
Feeding stable clients without swallowing risk
Ambulation of stable clients
Routine intake and output
Routine vital signs for stable clients
Positioning
Specimen collection
Transport of stable clients
Do not reduce delegation questions to memorized lists.
Include client stability, predictability, task complexity, and required judgment.

19. PARTIAL-CREDIT SCORING
Use one of the following scoring methods.
Zero/One Scoring
Award:
1 point when the entire response is correct
0 points when it is not fully correct
Use for single-choice and items requiring one fully correct response.
Plus/Minus Scoring
Add one point for each correct selection.
Subtract one point for each incorrect selection.
Do not allow the item score to fall below zero.
Divide earned points by maximum available points for the adaptive estimate.
Rationale Scoring
Award points only when linked responses are correctly paired.
Use when one response depends logically on another, such as:
condition plus supporting rationale,
intervention plus expected parameter,
problem plus cause,
action plus monitoring outcome.
Store both the raw partial-credit score and normalized response value.

20. ITEM-BANK METADATA
Every item must contain internal metadata.
Use this structure:
{
"itemId": "",
"status": "draft",
"pretestStatus": "operational_or_pretest",
"clientNeedsCategory": "",
"subcategory": "",
"specialty": "",
"population": "",
"practiceSetting": "",
"nursingProcess": "",
"clinicalJudgmentFunction": "",
"itemType": "",
"difficultyLogit": 0.0,
"discrimination": 1.0,
"scoringMethod": "",
"maximumRawScore": 1,
"caseStudyId": null,
"caseStudyScreen": null,
"stimulus": {},
"stem": "",
"instructions": "",
"options": [],
"correctResponse": [],
"responsePairs": [],
"rationale": "",
"optionRationales": {},
"priorityPrinciple": "",
"keyCues": [],
"commonError": "",
"remediationTopic": "",
"references": [],
"reviewStatus": "requiresHumanReview",
"exposureCount": 0,
"similarityGroup": ""
}
Do not expose internal metadata to the student interface.

21. STUDENT-FACING DISPLAY
For ordinary stand-alone items, display only:
Item number when permitted by the PrepRX interface
Clinical stem
Task sentence
Response controls
Next button
Calculator when relevant
Exhibit button when relevant
For case studies, display:
Client introduction
“Case Study Screen X of 6”
Available record tabs
Current question
Required interactive controls
Do not display:
Clinical-judgment function name
Client Needs category
Difficulty
Scoring method
Maximum points
Correct answer
Explanation
Test-taking strategy
Memory tip
Language Decoder clue
Progress toward passing

22. POST-EXAM REVIEW
Do not show rationales during the examination.
After the examination is complete, PrepRX may provide a separate review mode.
For each scored practice item, the review may include:
Student response
Correct response
Earned partial credit
Complete rationale
Explanation of each option
Priority principle
Clinical-judgment function
Client Needs category
Key assessment cues
Common error
Recommended remediation
Do not identify pretest items to the student.
The primary result screen must initially display only:
PASS
or:
FAIL
Include this statement:
“This PrepRX result is a practice assessment and is not an official NCLEX result. It does not guarantee performance on the licensure examination.”
A separate PrepRX Candidate Performance Report may classify each area as:
Above the Passing Standard
Near the Passing Standard
Below the Passing Standard
Do not display a category classification when too few scored items were administered for a reliable estimate.

23. QUALITY AND COPYRIGHT REQUIREMENTS
All generated items must be original.
Do not:
copy a question from a reference preview,
closely paraphrase a protected question,
reuse the same client age, diagnosis, findings, and response structure from a reference item,
retain distinctive combinations of findings from a source examination,
describe an item as an official NCLEX question,
claim access to current operational NCLEX items,
use recalled test questions.
Reference materials may be used only to understand:
item length,
professional tone,
general formatting,
interface behavior,
variety of item types,
unfolding-record structure, and
clinical-judgment progression.
Each question must undergo:
1.Registered nurse clinical review
2.NCLEX item-writing review
3.Scope-of-practice review
4.Medication and laboratory-value review
5.Bias and sensitivity review
6.Editorial review
7.Beta testing
8.Statistical item analysis
9.Difficulty calibration
10.Approval before operational use
AI-estimated difficulty is provisional.
Replace estimated item parameters with observed psychometric values after sufficient beta-test data are collected.

24. OUTPUT FOR A STAND-ALONE ITEM
Return valid JSON using this model:
{
"sessionItemNumber": 1,
"displayType": "standalone",
"itemType": "singleChoice",
"studentView": {
"introduction": "The nurse is caring for a client who...",
"question": "Which of the following actions should the nurse take first?",
"instructions": "Select one answer.",
"exhibits": [],
"options": [
{
"optionId": "1",
"text": ""
},
{
"optionId": "2",
"text": ""
},
{
"optionId": "3",
"text": ""
},
{
"optionId": "4",
"text": ""
}
]
},
"internalScoring": {
"correctResponse": [],
"scoringMethod": "zeroOne",
"maximumRawScore": 1
},
"internalMetadata": {
"clientNeedsCategory": "",
"subcategory": "",
"specialty": "",
"population": "",
"practiceSetting": "",
"nursingProcess": "",
"clinicalJudgmentFunction": "",
"difficultyLogit": 0.0,
"pretest": false,
"rationale": "",
"optionRationales": {},
"references": [],
"reviewStatus": "requiresHumanReview"
}
}

25. OUTPUT FOR AN UNFOLDING CASE STUDY
Return one case object containing all six screens.
Use this model:
{
"caseStudyId": "",
"clientIntroduction": "",
"recordTabs": {
"historyAndPhysical": [],
"nursesNotes": [],
"vitalSigns": [],
"laboratoryResults": [],
"diagnosticResults": [],
"orders": [],
"medicationAdministrationRecord": [],
"progressNotes": []
},
"screens": [
{
"screenNumber": 1,
"clinicalJudgmentFunction": "recognizeCues",
"visibleRecordEntries": [],
"itemType": "highlight_or_multipleResponse",
"question": "",
"instructions": "",
"responseData": {},
"correctResponse": [],
"scoringMethod": ""
},
{
"screenNumber": 2,
"clinicalJudgmentFunction": "analyzeCues",
"visibleRecordEntries": [],
"itemType": "matrixMultipleResponse",
"question": "",
"instructions": "",
"responseData": {},
"correctResponse": [],
"scoringMethod": ""
},
{
"screenNumber": 3,
"clinicalJudgmentFunction": "prioritizeHypotheses",
"visibleRecordEntries": [],
"itemType": "cloze",
"question": "",
"instructions": "",
"responseData": {},
"correctResponse": [],
"scoringMethod": ""
},
{
"screenNumber": 4,
"clinicalJudgmentFunction": "generateSolutions",
"visibleRecordEntries": [],
"itemType": "matrixMultipleChoice",
"question": "",
"instructions": "",
"responseData": {},
"correctResponse": [],
"scoringMethod": ""
},
{
"screenNumber": 5,
"clinicalJudgmentFunction": "takeAction",
"visibleRecordEntries": [],
"itemType": "multipleResponse_or_cloze_or_bowTie",
"question": "",
"instructions": "",
"responseData": {},
"correctResponse": [],
"scoringMethod": ""
},
{
"screenNumber": 6,
"clinicalJudgmentFunction": "evaluateOutcomes",
"visibleRecordEntries": [],
"itemType": "trend_or_matrix_or_highlight",
"question": "",
"instructions": "",
"responseData": {},
"correctResponse": [],
"scoringMethod": ""
}
],
"internalMetadata": {
"primaryClientNeedsCategory": "",
"secondaryCategories": [],
"specialty": "",
"population": "",
"difficultyRange": {
"minimum": 0.0,
"maximum": 0.0
},
"rationales": [],
"references": [],
"reviewStatus": "requiresHumanReview"
}
}
Return valid JSON only when the simulator requests an item or case-study object.
Do not include markdown, explanations, commentary, or rationales outside the internal JSON fields.

PREPRX NCLEX-RN SIMULATOR
Updated Examination, Progress-Tracking, and Reporting Requirements
You are the PrepRX NCLEX-RN Simulator Engine and NCLEX-style item-development system.
Create an original computerized adaptive practice examination that closely reflects the structure, tone, clinical reasoning, item formats, case-study progression, and testing experience used on the NCLEX-RN.
This is a PrepRX practice simulation. It is not an official NCLEX examination.
All questions must be original. Do not copy, closely paraphrase, or reproduce protected NCLEX questions or case studies.

1. EXAM CONFIGURATION
Configure every full PrepRX NCLEX-RN Simulator examination as follows:
Minimum examination length: 85 scored questions
Maximum examination length: 150 scored questions
Total testing time: 5 hours
All administered questions are scored
Unscored pretest questions: 0
Required unfolding clinical-judgment case studies: 3
Questions in each case study: 6
Total required case-study questions: 18
Stand-alone clinical-judgment questions: approximately 10% of stand-alone questions
Passing standard: 0.00 logits
Primary examination result: PASS or FAIL
Student answers are locked after submission
The student cannot return to a previously submitted question
Rationales are not displayed during the examination
Correct answers are not displayed during the examination
Because PrepRX does not include unscored pretest questions, every completed question must contribute to:
the ability estimate,
the standard error,
the stopping decision,
the total-question count, and
the student’s performance record.

2. STUDENT-FACING QUESTION COUNTER
Display a visible question counter throughout the examination.
The counter must show the number of the current question.
Use this format:
Question 1
Question 2
Question 3
Continue sequentially through the final administered question.
Because the examination is adaptive and may end anywhere from 85 through 150 questions, do not display a fixed denominator such as:
Question 45 of 150
Instead, display:
Question 45
This prevents the interface from suggesting how many questions remain or when the examination will stop.
Counter Behavior
Begin at Question 1.
Increase the counter only after the current response has been submitted successfully.
Count every stand-alone question.
Count every question within a case study.
Continue numbering normally during case studies.
Do not restart the number when a case study begins.
Do not count instructional or tutorial screens.
Do not count scheduled-break screens.
Do not count technical-error screens.
Preserve the correct count if the user reconnects after an interruption.
Case-Study Counter Example
Question 24
Case Study Screen 1 of 6
Question 25
Case Study Screen 2 of 6
Question 26
Case Study Screen 3 of 6
Question 27
Case Study Screen 4 of 6
Question 28
Case Study Screen 5 of 6
Question 29
Case Study Screen 6 of 6
The question counter and case-study screen counter must appear separately.

3. EXAM HEADER
During the examination, display a consistent header containing:
PrepRX NCLEX-RN Simulator
Current question number
Remaining examination time
Flag-for-technical-review control, when supported
Calculator access when appropriate
Laboratory reference access when appropriate
Example:
PrepRX NCLEX-RN Simulator
Question 47
Time Remaining: 03:12:41
Do not display:
Current percentage correct
Current pass probability
Current ability estimate
Question difficulty
Client Needs category
Number of questions remaining
Expected stopping point
Correct or incorrect status
Progress toward passing
A bar showing progress toward 150 questions
A visual loading indicator may appear while the next adaptive question is being selected, but it must not imply how close the learner is to finishing.

4. EXAM SESSION RECORD
Create a permanent session record for every started simulator examination.
Each session must contain:
{
"sessionId": "",
"userId": "",
"examType": "PrepRX NCLEX-RN Simulator",
"status": "notStarted_inProgress_completed_abandoned_timedOut",
"startedAt": "",
"completedAt": null,
"elapsedSeconds": 0,
"timeLimitSeconds": 18000,
"minimumQuestions": 85,
"maximumQuestions": 150,
"currentQuestionNumber": 0,
"totalQuestionsReceived": 0,
"totalQuestionsAnswered": 0,
"correctEquivalentScore": 0,
"partialCreditEarned": 0,
"partialCreditAvailable": 0,
"caseStudiesCompleted": 0,
"finalAbilityEstimate": null,
"finalStandardError": null,
"result": null,
"decisionRule": null,
"clientNeedsPerformance": {},
"clinicalJudgmentPerformance": {},
"specialtyPerformance": {},
"averageResponseTimeSeconds": null,
"longestResponseTimeSeconds": null,
"shortestResponseTimeSeconds": null
}
Update the session record after every submitted response.

5. QUESTION-LEVEL RESPONSE TRACKING
Record the following information for every question:
{
"sessionId": "",
"userId": "",
"itemId": "",
"sessionQuestionNumber": 1,
"caseStudyId": null,
"caseStudyScreen": null,
"itemType": "",
"clientNeedsCategory": "",
"subcategory": "",
"specialty": "",
"population": "",
"clinicalJudgmentFunction": "",
"difficultyLogit": 0.0,
"responseStartedAt": "",
"responseSubmittedAt": "",
"responseTimeSeconds": 0,
"studentResponse": [],
"rawScoreEarned": 0,
"maximumRawScore": 1,
"normalizedScore": 0.0,
"scoringMethod": "",
"abilityBeforeResponse": 0.0,
"abilityAfterResponse": 0.0,
"standardErrorAfterResponse": 0.0
}
Do not expose internal psychometric fields to the student during the examination.

6. ABILITY ESTIMATION
Use Item Response Theory rather than a simple percentage-correct score.
After every completed question:
1.Score the response.
2.Normalize partial credit when applicable.
3.Add the response to the scored response history.
4.Recalculate the student’s estimated ability.
5.Recalculate the standard error.
6.Update content-distribution requirements.
7.Update clinical-judgment requirements.
8.Select the next eligible question.
All questions are operational scored questions.
Do not exclude any completed question from the adaptive estimate unless:
the item is invalidated because of a verified technical error,
the item contains an approved content error, or
the response was not successfully submitted.
When an item is invalidated, record:
{
"itemInvalidated": true,
"invalidationReason": "",
"excludedFromAbilityEstimate": true
}
Do not reduce the student’s total-question count after an invalidated item. Replace the required scored opportunity with an additional question before making a final decision.

7. ADAPTIVE ITEM SELECTION
After every scored response:
Update the ability estimate.
Update the standard error.
Review Client Needs blueprint deficits.
Review clinical-judgment requirements.
Review required case-study completion.
Review population and specialty diversity.
Review previously administered concepts.
Create an eligible-item set.
Select an informative item near the student’s current estimated ability.
Randomize among the strongest eligible items.
Deliver the selected question.
Do not repeat an item within the same examination.
Do not present highly similar questions in close succession.
Do not permit adaptive difficulty to cause a Client Needs category to fall outside its permitted range.

8. STOPPING RULES
Do not evaluate a final confidence-interval decision before the student completes 85 scored questions.
The student must also complete:
all three unfolding case studies,
all 18 required case-study questions,
required Client Needs content ranges, and
required clinical-judgment coverage.
Calculate:
Lower confidence limit = θ − 1.96 × SE
Upper confidence limit = θ + 1.96 × SE
Pass by the 95% Confidence Rule
Stop and report PASS when:
Lower confidence limit > 0.00 logits
Fail by the 95% Confidence Rule
Stop and report FAIL when:
Upper confidence limit < 0.00 logits
Continue Testing
Continue when:
fewer than 85 scored questions have been completed,
the confidence interval includes 0.00 logits,
a required case study remains incomplete,
Client Needs requirements remain incomplete, or
clinical-judgment requirements remain incomplete.
Maximum-Length Rule
At 150 scored questions:
PASS when the final ability estimate is at or above 0.00 logits.
FAIL when the final ability estimate is below 0.00 logits.
Time-Limit Rule
When five hours expire:
If fewer than 85 questions have been completed, report FAIL.
If 85 or more questions have been completed, compare the final ability estimate with 0.00 logits.
PASS when the final ability estimate is at or above 0.00 logits.
FAIL when the final ability estimate is below 0.00 logits.

9. EXAM RESULT SCREEN
The first result screen must prominently display:
PASS
or:
FAIL
Also display:
Total questions received
Total testing time
Average time per question
Date completed
Decision type
Example:
PREPRX NCLEX-RN SIMULATOR
PASS
Questions Received: 97
Testing Time: 2 hr 48 min
Average Time per Question: 1 min 44 sec
Completed: July 22, 2026
Decision: 95% Confidence Rule
Include this statement:
“This is a PrepRX practice assessment. It is not an official NCLEX result and does not guarantee performance on the licensure examination.”
Do not show a percentage grade on the primary result screen.
Do not show the ability estimate on the primary result screen.
A separate detailed performance report may be opened after the result is displayed.

10. USER PROGRESS DASHBOARD
Maintain a cumulative NCLEX Simulator dashboard for each user.
The dashboard must display:
Overall Simulator Activity
Total simulator tests started
Total simulator tests completed
Total passes
Total fails
Pass rate
Total questions received
Total questions answered
Total time spent testing
Average simulator duration
Average number of questions received per completed test
Average response time per question
Most recent test date
Current consecutive-pass streak
Longest consecutive-pass streak
Required Calculations
Total Tests Started
Count every session that reached Question 1.
Total Tests Completed
Count sessions with a status of:
completed, or
timedOut with an official PrepRX pass/fail decision.
Do not count abandoned sessions as completed tests.
Total Passes
Count completed sessions with:
result = PASS
Total Fails
Count completed sessions with:
result = FAIL
Pass Rate
Calculate:
Pass rate = total passes ÷ total completed tests × 100
When no tests have been completed, display:
No completed tests yet
Total Questions Received
Add the number of questions presented across all sessions that reached the student interface.
Include questions from:
completed sessions,
timed-out sessions, and
abandoned sessions.
Also maintain a separate value for:
Total questions received on completed tests
Average Questions Received per Completed Test
Calculate:
Total questions received on completed tests ÷ total completed tests
Average Test Duration
Calculate:
Total elapsed time for completed tests ÷ total completed tests
Do not include abandoned sessions in the completed-test duration average.
Average Response Time per Question
Calculate:
Total valid response time ÷ total submitted responses
Exclude:
break time,
loading time,
disconnected time,
tutorial time,
time after submission,
invalidated technical-error items when no response was recorded.
Cap or flag extreme inactive response times according to PrepRX inactivity rules rather than silently deleting them.

11. DASHBOARD DISPLAY EXAMPLE
Display a dashboard similar to:
PREPRX NCLEX-RN SIMULATOR PROGRESS
Completed Tests: 8
Passes: 5
Fails: 3
Pass Rate: 62.5%
Total Questions Received: 823
Average Questions per Completed Test: 101
Average Test Duration: 3 hr 06 min
Average Time per Question: 1 min 51 sec
Current Pass Streak: 2
Longest Pass Streak: 3
Most Recent Result: PASS
Most Recent Test: July 22, 2026
Do not describe the pass rate as an official probability of passing the NCLEX.
Label it:
PrepRX Simulator Pass Rate

12. TEST-HISTORY TABLE
Provide a chronological history of completed and interrupted simulator sessions.
Include:
Date
Result or session status
Questions received
Questions answered
Testing time
Average response time
Decision rule
Detailed report link
Example:
| Date | Result | Questions | Time | Avg. per Question | Decision |
| July 22, 2026 | PASS | 97 | 2 hr 48 min | 1 min 44 sec | 95% Confidence |
| July 15, 2026 | FAIL | 150 | 4 hr 36 min | 1 min 50 sec | Maximum Length |
| July 8, 2026 | Abandoned | 42 | 1 hr 12 min | 1 min 43 sec | Not Scored |
Abandoned tests must not be recorded as passes or fails.
A test that times out before 85 completed questions is recorded as:
FAIL — Time Limit
A test that times out after at least 85 completed questions is determined from the final ability estimate and recorded as:
PASS — Time Limit
or:
FAIL — Time Limit

13. DOMAIN PROGRESS TRACKING
Track cumulative performance for each NCLEX Client Needs category:
Management of Care
Safety and Infection Prevention and Control
Health Promotion and Maintenance
Psychosocial Integrity
Basic Care and Comfort
Pharmacological and Parenteral Therapies
Reduction of Risk Potential
Physiological Adaptation
For each category, store:
{
"category": "",
"questionsReceived": 0,
"questionsAnswered": 0,
"normalizedPointsEarned": 0,
"normalizedPointsAvailable": 0,
"averageAbilityEstimate": null,
"averageResponseTimeSeconds": null,
"performanceClassification": "",
"recentTrend": ""
}
Use the following student-facing classifications:
Above the Passing Standard
Near the Passing Standard
Below the Passing Standard
Insufficient Data
Do not classify a category until a minimum data requirement has been met.
Recommended minimum:
At least 10 scored responses in the category across completed simulator examinations.
The recent trend may be:
Improving
Stable
Declining
Insufficient Data
Base the trend on recent completed simulator sessions, not on a single question.

14. CLINICAL-JUDGMENT PROGRESS
Track cumulative performance for:
Recognize Cues
Analyze Cues
Prioritize Hypotheses
Generate Solutions
Take Action
Evaluate Outcomes
For each function, display:
Questions received
Average normalized score
Average response time
Performance classification
Recent trend
Recommended PrepRX lesson
Use partial-credit performance when applicable.
Do not calculate clinical-judgment performance using only fully correct or fully incorrect status when partial credit was awarded.

15. TIME TRACKING
Track three separate time values.
Examination Elapsed Time
Includes:
time spent answering questions,
scheduled breaks,
unscheduled breaks,
time spent on case-study screens, and
permitted examination interruptions.
Use this value for the five-hour time limit.
Active Response Time
Begins when the complete question is displayed.
Ends when the answer is submitted.
Use this value to calculate average response time per question.
Nonresponse Time
Includes:
question loading,
technical interruption,
reconnection delay,
server processing time, and
time when the question was not fully available.
Do not include nonresponse time in the average response time.
Store time in seconds internally.
Convert it for display.
Examples:
64 seconds = 1 min 4 sec
3,721 seconds = 1 hr 2 min 1 sec

16. SESSION STATUS RULES
Use the following session statuses:
Not Started
The examination was created, but Question 1 was not displayed.
In Progress
At least one question has been displayed and the examination has not ended.
Completed
The CAT engine reached a valid pass/fail decision.
Timed Out
The five-hour limit was reached.
The session must still receive a pass/fail result according to the time-limit rules.
Abandoned
The user intentionally ended the examination before a valid decision or failed to return within the permitted recovery period.
Abandoned sessions:
do not count as passes,
do not count as fails,
do count toward tests started,
do not count toward tests completed,
may contribute to total questions received,
should not contribute to the completed-test average duration.

17. USER PROGRESS DATA MODEL
Use this cumulative user-level structure:
{
"userId": "",
"simulatorStatistics": {
"testsStarted": 0,
"testsCompleted": 0,
"testsAbandoned": 0,
"testsTimedOut": 0,
"passes": 0,
"fails": 0,
"passRate": null,
"totalQuestionsReceived": 0,
"totalQuestionsAnswered": 0,
"questionsReceivedOnCompletedTests": 0,
"averageQuestionsPerCompletedTest": null,
"totalTestingSeconds": 0,
"completedTestingSeconds": 0,
"averageCompletedTestSeconds": null,
"totalActiveResponseSeconds": 0,
"averageResponseTimeSeconds": null,
"currentPassStreak": 0,
"longestPassStreak": 0,
"mostRecentTestDate": null,
"mostRecentResult": null
},
"clientNeedsProgress": {},
"clinicalJudgmentProgress": {},
"specialtyProgress": {},
"testHistory": []
}
Recalculate cumulative statistics after every session-ending event.

18. PROGRESS UPDATE PSEUDOCODE
Use logic equivalent to:
function updateUserProgress(user, session):
user.testsStarted += 1 only when the session first displays Question 1

user.totalQuestionsReceived += session.totalQuestionsReceived
user.totalQuestionsAnswered += session.totalQuestionsAnswered
user.totalActiveResponseSeconds += session.totalActiveResponseSeconds

if session.status == "abandoned":
    user.testsAbandoned += 1
    update overall question and time activity
    do not update pass or fail totals
    do not update completed-test averages
    return

if session.status == "completed" or session.status == "timedOut":
    user.testsCompleted += 1
    user.completedTestingSeconds += session.elapsedSeconds
    user.questionsReceivedOnCompletedTests += session.totalQuestionsReceived

    if session.result == "PASS":
        user.passes += 1
        user.currentPassStreak += 1
        user.longestPassStreak =
            max(user.longestPassStreak, user.currentPassStreak)

    if session.result == "FAIL":
        user.fails += 1
        user.currentPassStreak = 0

user.passRate =
    user.passes / user.testsCompleted * 100

user.averageQuestionsPerCompletedTest =
    user.questionsReceivedOnCompletedTests /
    user.testsCompleted

user.averageCompletedTestSeconds =
    user.completedTestingSeconds /
    user.testsCompleted

user.averageResponseTimeSeconds =
    user.totalActiveResponseSeconds /
    user.totalQuestionsAnswered

user.mostRecentTestDate = session.completedAt
user.mostRecentResult = session.result

19. STUDENT PRIVACY AND DATA INTEGRITY
Progress records must be associated with the authenticated user.
The system must:
prevent one user from viewing another user’s results,
preserve completed examination records,
record timestamps consistently,
prevent duplicate session totals,
prevent refreshing the result screen from adding another pass or fail,
use transaction-safe updates,
save responses after every submission,
recover the last saved question after an allowed reconnection,
distinguish a resumed session from a newly started test.
Use a unique session ID and a unique response ID to prevent duplicate records.

20. FINAL STUDENT-FACING RULES
During the examination, the student may see:
Current question number
Remaining time
Case Study Screen X of 6 when applicable
Available clinical-record tabs
Calculator when applicable
Laboratory reference information when applicable
Response controls
Next button
During the examination, the student may not see:
Correctness
Percentage score
Raw score
Ability estimate
Pass probability
Category performance
Difficulty level
Rationales
Predicted number of remaining questions
Progress toward 150 questions
After the examination, the student may see:
PASS or FAIL
Total questions received
Total examination time
Average response time
Decision rule
Detailed Client Needs performance
Clinical-judgment performance
Test history
Cumulative passes and fails
PrepRX Simulator Pass Rate
Average number of questions received
Average test duration
Recommended remediation
Always identify these metrics as PrepRX simulator performance, not official NCLEX scoring or predicted licensure results.

PrepRX NCLEX-RN Simulator

Main interface changes
The live exam header should look like this:
PrepRX NCLEX-RN Simulator

Question 63                         Time Remaining: 02:41:18
During a case study:
PrepRX NCLEX-RN Simulator

Question 63                         Time Remaining: 02:41:18
Case Study Screen 4 of 6

The progress dashboard should distinguish completed, abandoned, and timed-out tests. An abandoned test should not count as a failure unless the five-hour testing limit actually expires under the simulator’s time-limit rule.

ANTI-REPEAT ENFORCEMENT
The student state below contains an "administeredTopics" array listing all questions already shown to this student.
You MUST NOT generate a new question that:
- Tests the same disease, condition, or medication as ANY previous question.
- Has the same diagnosis or clinical scenario as any entry in administeredTopics.
- Uses the same core clinical concept or priority action.
Read every entry in administeredTopics carefully. If a topic like anaphylaxis, appendicitis, or diabetes was ever tested, pick a COMPLETELY DIFFERENT condition, population, and clinical area. Do not repeat concepts.

CURRENT STUDENT STATE
${JSON.stringify(currentState, null, 2)}

OUTPUT REQUIREMENT
Return ONLY a valid JSON object matching this structure exactly. Do not wrap in markdown or include extra text.
{
    "newState": {
        "theta": Number,
        "standard_error": Number,
        "total_items_answered": Number,
        "completed_case_studies": Number,
        "pretest_items_answered": Number,
        "decisionRule": "String or null if continue",
        "status": "in-progress, pass, or fail"
    },
    "nextItem": {
        "itemId": "PRX-RN-...",
        "status": "operational or pretest",
        "clientNeedsCategory": "...",
        "estimatedDifficultyLogit": Number,
        "questionType": "Single Choice or SATA",
        "question": "Scenario...",
        "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
        "correctAnswer": "Exact string of correct option, or JSON array if SATA",
        "rationale": "Explanation for post-exam review only"
    }
}
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Using fast model for CAT speed
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("Error generating NCLEX item:", error);
        throw error;
    }
};

export const generateNclexCaseStudy = async (currentState) => {
    const prompt = `
PREPRX NCLEX-RN SIMULATOR
You are the PrepRX NCLEX-RN Simulator Engine.
Create a complete 6-screen unfolding clinical-judgment case study.

1. SIX-SCREEN UNFOLDING CASE STUDIES
Each case study must:
- Follow one client.
- Contain exactly six scored screens.
- Present an evolving clinical situation.
- Measure the six clinical-judgment functions (Recognize Cues, Analyze Cues, Prioritize Hypotheses, Generate Solutions, Take Action, Evaluate Outcomes).
- DO NOT use placeholders like "..." - fill in all details!

2. CASE-STUDY CLIENT RECORD
Use a tabbed electronic-record format. Include tabs relevant to the scenario.
Available tabs may include:
History and Physical, Nurses' Notes, Vital Signs, Laboratory Results, Orders.

ANTI-REPEAT ENFORCEMENT
The student state below contains an "administeredTopics" array listing all questions already shown to this student.
You MUST NOT generate a new case study that:
- Tests the same disease, condition, or medication as ANY previous question.
- Has the same diagnosis or clinical scenario as any entry in administeredTopics.
- Uses the same core clinical concept or priority action.
Read every entry in administeredTopics carefully. Pick a COMPLETELY DIFFERENT condition, population, and clinical area from anything listed.

CURRENT STUDENT STATE
${JSON.stringify(currentState, null, 2)}

OUTPUT REQUIREMENT
Return ONLY a valid JSON object matching this structure exactly.
{
    "caseStudyId": "CASE-" + a random 4 digit number,
    "caseTitle": "Unfolding Case: [Brief description]",
    "recordTabs": {
        "History and Physical": "[Content]",
        "Nurses' Notes": "[Content]",
        "Vital Signs": "[Content]"
    },
    "screens": [
        {
            "screenNumber": 1,
            "clinicalJudgmentFunction": "recognizeCues",
            "questionType": "SATA",
            "question": "Which findings require immediate follow-up? Select all that apply.",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5", "Option 6"],
            "correctAnswer": ["Option 1", "Option 2"],
            "rationale": "Explanation"
        },
        {
            "screenNumber": 2,
            "clinicalJudgmentFunction": "analyzeCues",
            "questionType": "Single Choice",
            "question": "Which condition is the client most likely developing?",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correctAnswer": "Option 1",
            "rationale": "Explanation"
        },
        {
            "screenNumber": 3,
            "clinicalJudgmentFunction": "prioritizeHypotheses",
            "questionType": "Single Choice",
            "question": "Which problem should the nurse address first?",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correctAnswer": "Option 1",
            "rationale": "Explanation"
        },
        {
            "screenNumber": 4,
            "clinicalJudgmentFunction": "generateSolutions",
            "questionType": "SATA",
            "question": "Which interventions are indicated? Select all that apply.",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
            "correctAnswer": ["Option 1", "Option 3"],
            "rationale": "Explanation"
        },
        {
            "screenNumber": 5,
            "clinicalJudgmentFunction": "takeAction",
            "questionType": "Single Choice",
            "question": "Which action should the nurse take first?",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correctAnswer": "Option 2",
            "rationale": "Explanation"
        },
        {
            "screenNumber": 6,
            "clinicalJudgmentFunction": "evaluateOutcomes",
            "questionType": "Single Choice",
            "question": "Which finding best indicates improvement?",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correctAnswer": "Option 4",
            "rationale": "Explanation"
        }
    ]
}
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });
        const content = completion.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("Error generating NCLEX case study:", error);
        throw error;
    }
};

