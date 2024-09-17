export const CONFIG = {
    KAFKA: `import { Kafka } from 'kafkajs';

// Kafka Config
const kafkaConfig = new Kafka({
    clientId: 'appointments-service',
    brokers: ['localhost:9092'], // TODO: Change this to the actual Kafka broker
});

export default kafkaConfig;
    `,
}