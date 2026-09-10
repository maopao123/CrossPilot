import 'dotenv/config';
import { WorkerService } from './worker.service.js';

async function bootstrap() {
  const workerService = new WorkerService();
  await workerService.start();

  const handleShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, initiating graceful shutdown...`);
    await workerService.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal Worker Error:', err);
  process.exit(1);
});
