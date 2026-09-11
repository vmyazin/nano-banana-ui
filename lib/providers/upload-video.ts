import { validateEditVideo } from './video-edit';
const API = 'https://api.runware.ai/v1';

/** Direct upload: a video data URI must never pass through Vercel's body limit.
 * Only called after Generate, with the explicitly chosen browser Runware key.
 */
export async function uploadRunwareVideo(file: File, apiKey: string, onProgress: (percent: number) => void): Promise<string> {
  validateEditVideo(file);
  const media = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the source video.'));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API);
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 180_000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error('Source upload failed. Check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('Source upload timed out. Try again.'));
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || payload.errors?.length) throw new Error(payload.errors?.[0]?.message || 'Runware could not store the source video.');
        const id = payload.data?.[0]?.mediaUUID;
        if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) throw new Error('Runware did not return a source video ID.');
        resolve(id);
      } catch (error) { reject(error); }
    };
    xhr.send(JSON.stringify([{taskType: 'mediaStorage', taskUUID: crypto.randomUUID(), operation: 'upload', media}]));
  });
}
