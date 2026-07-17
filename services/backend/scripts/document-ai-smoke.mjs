import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { createDocumentAiOcr } from '../src/adapters/document-ai-ocr.js';
import { loadConfig } from '../src/config.js';

if (process.env.RUN_REAL_GOOGLE_PROVIDER_TESTS !== 'true'
  || process.env.CAPABILITY_EXECUTION_MODE !== 'google') {
  throw new Error('Real Document AI smoke is explicitly disabled');
}

const filePath = process.argv[2];
const mimeType = process.argv[3];
const format = ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' })[mimeType];
if (!filePath || !format) throw new Error('Usage: npm run smoke:document-ai -- FILE MIME');

const config = loadConfig(process.env);
const [facts, metadata] = await Promise.all([stat(filePath), sharp(filePath).metadata()]);
const provider = createDocumentAiOcr({ config: config.capabilities.documentAi });
const result = await provider.process({
  clientRequestId: 'ocrrequest_smoke0001',
  executionId: 'execution_smoke0001',
  filePath,
  format,
  mimeType,
  sizeBytes: facts.size,
  width: metadata.width,
  height: metadata.height,
  signal: new AbortController().signal,
});
process.stdout.write(`${JSON.stringify({
  providerRequestId: result.providerRequestId,
  pageCount: result.document.pages?.length ?? 0,
  textLength: result.document.text?.length ?? 0,
})}\n`);
