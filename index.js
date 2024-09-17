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

// Define la versión de tu CLI
program.version('1.0.0');

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
    // Función para generar un token aleatorio
    const generateRandomToken = (length) => {
        return crypto.randomBytes(length).toString('hex');
    };

    // Función para hashear el token usando bcrypt
    const hashToken = async (token) => {
        return new Promise((resolve, reject) => {
            bcrypt.hash(token, 10, (err, hash) => {
                if (err) reject(err);
                else resolve(hash);
            });
        });
    };

    program
        .command('make:token')
        .description('CLI para generar y manejar Bearer Tokens')
        .action(async () => {
            try {
                // Generar token
                const tokenLength = 64;
                const token = generateRandomToken(tokenLength);

                // Hashear el token
                const tokenHash = await hashToken(token);

                // Escapar caracteres '/' en el hash para sed (si es necesario para uso en otros scripts)
                const escapedTokenHash = tokenHash.replace(/\//g, '\\/');

                // Leer archivo .env
                const envPath = '.env';
                let envContent = '';
                if (fs.existsSync(envPath)) {
                    envContent = await fs.readFile(envPath, 'utf8');
                }

                // Reemplazar o agregar la línea API_TOKEN_HASH en el archivo .env
                const newEnvContent = envContent.replace(
                    /API_TOKEN_HASH=.*/g,
                    `API_TOKEN_HASH=${escapedTokenHash}`
                );
                if (newEnvContent === envContent) {
                    // No se encontró API_TOKEN_HASH en el archivo, agregar al final
                    await fs.appendFile(envPath, `API_TOKEN_HASH=${escapedTokenHash}\n`);
                } else {
                    await fs.writeFile(envPath, newEnvContent, 'utf8');
                }

                // Guardar el token en un archivo de texto
                await fs.writeFile('token(deleteMe).txt', token, 'utf8');

                console.log(chalk.green('Token generado y guardado correctamente.'));
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

function configKafka() {
    program
        .command('kafka:config')
        .description('Crea la configuración de Kafka')
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
        .description('Crea un nuevo consumidor de Kafka')
        .action(() => {
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Nombre del consumidor',
                },
                {
                    type: 'input',
                    name: 'topic',
                    message: 'Nombre del topic',
                },
            ]).then((answers) => {
                const consumer = KAFKA.CONSUMER(answers.name, answers.topic);

                fs.outputFile(`Http/Consumers/${answers.name}.js`, consumer)
                    .then(() => console.log(chalk.green(`Consumer ${answers.name} created successfully!`)))
                    .catch((err) => console.error(chalk.red('Error: '), err));
            });
        });
}

function makeProducer() {
    program
        .command('kafka:producer')
        .description('Crea un nuevo producer de Kafka')
        .action(() => {
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Nombre del PRODUCER',
                },
                {
                    type: 'input',
                    name: 'topic',
                    message: 'Nombre del topic',
                },
            ]).then((answers) => {
                const producer = KAFKA.PRODUCER(answers.name, answers.topic);

                fs.outputFile(`Http/Producer/${answers.name}.js`, producer)
                    .then(() => console.log(chalk.green(`producer ${answers.name} created successfully!`)))
                    .catch((err) => console.error(chalk.red('Error: '), err));
            });
        });
}

function createKafkaContainer() {
    program
        .command('kafka:create')
        .description('Crea un contenedor de Kafka en Docker')
        .action(async () => {
            try {
                const containerName = 'kafka-server';
                const imageName = 'apache/kafka:3.8.0';

                const { stdout } = await execPromise(`docker ps -aq -f name=${containerName}`);
                if (stdout.trim()) {
                    console.log(chalk.yellow(`El contenedor ${containerName} ya existe.`));
                    return;
                }

                console.log(`Creando el contenedor ${containerName}...`);
                await execPromise(`docker run -d --name ${containerName} -p 9092:9092 -e ALLOW_PLAINTEXT_LISTENER=yes ${imageName}`);
                console.log(chalk.green(`Contenedor ${containerName} creado y ejecutándose.`));
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

function startKafkaContainer() {
    program
        .command('kafka:start')
        .description('Levanta el contenedor de Kafka en Docker')
        .action(async () => {
            try {
                const containerName = 'kafka-server';

                const { stdout } = await execPromise(`docker ps -aq -f name=${containerName}`);
                if (!stdout.trim()) {
                    console.error(chalk.red('Error: El contenedor no existe.'));
                    return;
                }

                const { stdout: isRunning } = await execPromise(`docker ps -q -f name=${containerName}`);
                if (isRunning.trim()) {
                    console.log(chalk.yellow(`El contenedor ${containerName} ya está en ejecución.`));
                    return;
                }

                console.log(`Iniciando el contenedor ${containerName}...`);
                await execPromise(`docker start ${containerName}`);
                console.log(chalk.green(`Contenedor ${containerName} iniciado.`));
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}

function generateTopicsList() {
    program
        .command('kafka:topics')
        .description('Genera un archivo de lista de topics')
        .action(() => {
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'topics',
                    message: 'Ingrese los nombres de los topics separados por comas:',
                }
            ]).then((answers) => {
                const topics = answers.topics.split(',').map(topic => topic.trim());
                const topicsList = topics.join('\n');

                fs.outputFile('topics.txt', topicsList)
                    .then(() => console.log(chalk.green('Archivo de topics generado correctamente.')))
                    .catch((err) => console.error(chalk.red('Error: '), err));
            });
        });
}

async function kafkaMigrate() {
    program
        .command('kafka:migrate')
        .description('Crea los topics en el servidor Kafka desde el archivo topics.txt')
        .action(async () => {
            try {
                const topicsFile = 'topics.txt';
                if (!fs.existsSync(topicsFile)) {
                    console.error(chalk.red('Error: El archivo topics.txt no existe.'));
                    return;
                }

                const topics = fs.readFileSync(topicsFile, 'utf8').split('\n').filter(Boolean);

                for (const topic of topics) {
                    console.log(`Creando el topic ${topic}...`);
                    await execPromise(`docker exec kafka-server /opt/kafka/bin/kafka-topics.sh --create --topic ${topic} --bootstrap-server localhost:9092`);
                    console.log(`Topic ${topic} creado exitosamente.`);
                }
            } catch (error) {
                console.error(chalk.red('Error:'), error.message);
            }
        });
}


main();