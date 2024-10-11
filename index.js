#!/usr/bin/env node

import { exec } from 'child_process';
import { program } from 'commander';

import inquirer from 'inquirer';
import fs from 'fs-extra';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import chalk from 'chalk';
import util from 'util';

import { CONFIG } from './Templates/config.template.js';
import { KAFKA } from './Templates/kafka.template.js';

const execPromise = util.promisify(exec);

// Define CLI version
program.version('1.2.1');

function main() {
    configKafka();
    makeConsumer();
    makeProducer();
    makeToken();
    createKafkaContainer();
    startKafkaContainer();
    generateTopicsList();
    kafkaMigrate();

    program.parse(process.argv);
}

async function makeToken() {
    // Generate random token
    const generateRandomToken = (length) => {
        return crypto.randomBytes(length).toString('hex');
    };

    // Encrypt token with bcrypt - Deprecated
    // const hashToken = async (token) => {
    //     return new Promise((resolve, reject) => {
    //         bcrypt.hash(token, 10, (err, hash) => {
    //             if (err) reject(err);
    //             else resolve(hash);
    //         });
    //     });
    // };

    program
        .command('make:token')
        .description('CLI to generate and manage Bearer Tokens')
        .action(async () => {
            try {
                // generate random token
                const tokenLength = 64;
                const token = generateRandomToken(tokenLength);

                // Escape '/' characters in the hash for sed (if necessary for use in other scripts)
                const escapedTokenHash = token.replace(/\//g, '\\/');

                // Read .env file
                const envPath = '.env';
                let envContent = '';
                if (fs.existsSync(envPath)) {
                    envContent = await fs.readFile(envPath, 'utf8');
                }

                // Replace or add the API_TOKEN_HASH line in the .env file
                const newEnvContent = envContent.replace(
                    /API_TOKEN_HASH=.*/g,
                    `API_TOKEN_HASH=${escapedTokenHash}`
                );
                if (newEnvContent === envContent) {
                    // API_TOKEN_HASH not found in the file, add at the end
                    await fs.appendFile(envPath, `API_TOKEN_HASH=${escapedTokenHash}\n`);
                } else {
                    await fs.writeFile(envPath, newEnvContent, 'utf8');
                }

                // Save the token in a text file
                await fs.writeFile('token(deleteMe).txt', token, 'utf8');

                console.log(chalk.green('Token generated and saved successfully.'));
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

function configKafka() {
    program
        .command('kafka:config')
        .description('Creates Kafka configuration')
        .action(() => {
            const config = CONFIG.KAFKA;

            fs.outputFile(`Config/kafka.js`, config)
                .then(() => console.log(chalk.green(`Kafka Config created successfully!`)))
                .catch((err) => console.error(chalk.red('Error: '), err));
        });
}

function makeConsumer() {
    program
        .command('kafka:consumer')
        .description('Creates a new Kafka consumer')
        .action(() => {
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Consumer name',
                },
                {
                    type: 'input',
                    name: 'topic',
                    message: 'Topic name',
                },
            ]).then((answers) => {
                const consumerName = toPascalCase(answers.name);
                const consumer = KAFKA.CONSUMER(consumerName, answers.topic);

                fs.outputFile(`Http/Consumer/${consumerName}.consumer.js`, consumer)
                    .then(() => console.log(chalk.green(`Consumer ${consumerName} created successfully!`)))
                    .catch((err) => console.error(chalk.red('Error: '), err));
            });
        });
}

function makeProducer() {
    program
        .command('kafka:producer')
        .description('Creates a new Kafka producer')
        .action(() => {
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Producer name',
                },
                {
                    type: 'input',
                    name: 'topic',
                    message: 'Topic name',
                },
            ]).then((answers) => {
                const producerName = toPascalCase(answers.name);
                const producer = KAFKA.PRODUCER(producerName, answers.topic);

                fs.outputFile(`Http/Producer/${producerName}.producer.js`, producer)
                    .then(() => console.log(chalk.green(`Producer ${producerName} created successfully!`)))
                    .catch((err) => console.error(chalk.red('Error: '), err));
            });
        });
}

function createKafkaContainer() {
    program
        .command('kafka:create')
        .description('Creates a Kafka container in Docker')
        .action(async () => {
            try {
                const containerName = 'kafka-server';
                const imageName = 'apache/kafka:3.8.0';

                const { stdout } = await execPromise(`docker ps -aq -f name=${containerName}`);
                if (stdout.trim()) {
                    console.log(chalk.yellow(`The container ${containerName} already exists.`));
                    return;
                }

                console.log(`Creating the container ${containerName}...`);
                await execPromise(`docker run -d --name ${containerName} -p 9092:9092 -e ALLOW_PLAINTEXT_LISTENER=yes ${imageName}`);
                console.log(chalk.green(`Container ${containerName} created and running.`));
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

function startKafkaContainer() {
    program
        .command('kafka:start')
        .description('Starts the Kafka container in Docker')
        .action(async () => {
            try {
                const containerName = 'kafka-server';

                const { stdout } = await execPromise(`docker ps -aq -f name=${containerName}`);
                if (!stdout.trim()) {
                    console.error(chalk.red('Error: The container does not exist.'));
                    return;
                }

                const { stdout: isRunning } = await execPromise(`docker ps -q -f name=${containerName}`);
                if (isRunning.trim()) {
                    console.log(chalk.yellow(`The container ${containerName} is already running.`));
                    return;
                }

                console.log(`Starting the container ${containerName}...`);
                await execPromise(`docker start ${containerName}`);
                console.log(chalk.green(`Container ${containerName} started.`));
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

function generateTopicsList() {
    program
        .command('kafka:topics')
        .description('Generates a topics list file')
        .action(() => {
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'topics',
                    message: 'Enter the topic names separated by commas:',
                }
            ]).then(async (answers) => {
                const newTopics = answers.topics.split(',').map(topic => topic.trim());

                // Read existing topics from the file if it exists
                const topicsFile = 'topics.txt';
                let existingTopics = [];
                if (fs.existsSync(topicsFile)) {
                    const fileContent = await fs.readFile(topicsFile, 'utf8');
                    existingTopics = fileContent.split('\n').filter(Boolean);
                }

                // Combine new topics with existing ones, removing duplicates
                const combinedTopics = Array.from(new Set([...existingTopics, ...newTopics]));

                // Write the combined topics back to the file
                const topicsList = combinedTopics.join('\n');
                await fs.writeFile(topicsFile, topicsList, 'utf8');

                console.log(chalk.green('Topics file updated successfully.'));
            }).catch((err) => console.error(chalk.red('Error: '), err));
        });
}

async function kafkaMigrate() {
    program
        .command('kafka:migrate')
        .description('Creates topics on the Kafka server from the topics.txt file')
        .action(async () => {
            try {
                const topicsFile = 'topics.txt';
                if (!fs.existsSync(topicsFile)) {
                    console.error(chalk.red('Error: The topics.txt file does not exist.'));
                    return;
                }

                const topics = fs.readFileSync(topicsFile, 'utf8').split('\n').filter(Boolean);

                for (const topic of topics) {
                    console.log(`Creating the topic ${topic}...`);
                    await execPromise(`docker exec kafka-server /opt/kafka/bin/kafka-topics.sh --create --topic ${topic} --bootstrap-server localhost:9092`);
                    console.log(`Topic ${topic} created successfully.`);
                }
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

// Handle functions
function toPascalCase(str) {
    return str
        .split(/[\s-]+/) // Split the string by spaces or hyphens
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize the first letter and lowercase the rest
        .join('');
}

main();
