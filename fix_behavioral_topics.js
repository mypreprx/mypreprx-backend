const mongoose = require('mongoose');
const dotenv = require('dotenv');
const CaseStudy = require('./models/CaseStudy'); // adjust path if needed

dotenv.config();

const uri = process.env.MONGO_URI;

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to MongoDB');

        try {
            // Behavioral Health mappings
            const mapping = {
                'case-studies': 'Case Studies',
                'psych-medication': 'Psych Medication',
                'cultural-sensitivity': 'Psych Med, Cultural Sensitivity',
                'therapeutic-communication': 'Therapeutic Communication'
            };

            for (const [oldTopic, newTopic] of Object.entries(mapping)) {
                const result = await CaseStudy.updateMany(
                    { 
                        category: 'Behavioral Health',
                        topic: oldTopic 
                    },
                    { 
                        $set: { topic: newTopic } 
                    }
                );
                console.log(`Updated ${result.modifiedCount} cases from '${oldTopic}' to '${newTopic}'`);
            }
            
            // Also handle cases where they were mapped incorrectly before
            const otherMappings = {
                'Psych Med Cultural Sensitivity': 'Psych Med, Cultural Sensitivity'
            }
            for (const [oldTopic, newTopic] of Object.entries(otherMappings)) {
                const result = await CaseStudy.updateMany(
                    { 
                        category: 'Behavioral Health',
                        topic: oldTopic 
                    },
                    { 
                        $set: { topic: newTopic } 
                    }
                );
                console.log(`Updated ${result.modifiedCount} cases from '${oldTopic}' to '${newTopic}'`);
            }

            console.log('Migration completed successfully.');
        } catch (error) {
            console.error('Error during migration:', error);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => {
        console.error('Connection error:', err);
    });
