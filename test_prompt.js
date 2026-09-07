import { getDetailedPromptForSubtopic } from './utilities/promptParser.js';

const res1 = getDetailedPromptForSubtopic('Pharmacology', 'Introduction to Pharmacology');
console.log(JSON.stringify(res1, null, 2));
