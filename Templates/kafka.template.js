export const KAFKA = {
    CONSUMER: (name, topic) => `import kafkaConfig from '../../Config/kafka.config.js';
import { executeQuery } from '../../Config/database.config.js';

const consumer = kafkaConfig.consumer({ groupId: '${topic}-group' });

export default async function ${name}Consumer() {
    await consumer.connect();
    await consumer.subscribe({
        topic: '${topic}-topic',
        fromBeginning: true
    });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            // Do something with the message
        },
    });
}
    `,

    PRODUCER: (name, topic) => `import kafkaConfig from '../../Config/kafka.config.js';

const producer = kafkaConfig.producer();

export default async function Create${name}Producer(message) {
    try {
        await producer.connect();
        await producer.send({
            topic: '${topic}-topic',
            messages: [
                { value: message },
            ],
        });
    } catch (err) {
        console.error('Error sending the message:', err);
    } finally {
        await producer.disconnect();
    }
};
`,
}