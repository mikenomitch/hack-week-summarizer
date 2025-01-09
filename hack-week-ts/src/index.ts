import { v4 as uuidv4 } from 'uuid';
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent, DurableObject } from 'cloudflare:workers';

interface Env {
	HACK_WEEK_BUCKET: R2Bucket;
	AI: Ai;
	ANALYZE_IMAGE: Workflow;
	ASSETS: Fetcher;
	ANALYZER_STORE: DurableObjectNamespace<AnalyzerStore>;
}

interface VideoData {
	id: string;
	status: string;
	description: string;
}

interface AIResponse {
	response?: string;
	tool_calls?: {
		name: string;
		arguments: unknown;
	}[];
}

export class AnalyzerStore extends DurableObject {
	protected state: DurableObjectState;
	protected env: Env;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.state = state;
		this.env = env;
	}

	async saveVideo(uuid: string, status: string, description: string): Promise<void> {
		const video = {
			id: uuid,
			status,
			description,
		};

		await this.state.storage.put(`video:${uuid}`, video);
	}

	async updateVideo(uuid: string, status: string, description: string): Promise<void> {
		const video = {
			id: uuid,
			status,
			description,
		};

		await this.state.storage.put(`video:${uuid}`, video);
	}

	async getVideo(uuid: string): Promise<VideoData | undefined> {
		return await this.state.storage.get<VideoData>(`video:${uuid}`);
	}

	async getAllVideos(): Promise<any[]> {
		const videos = [];
		let list = await this.state.storage.list({ prefix: 'video:' });
		for (const [key, value] of list) {
			videos.push(value);
		}
		return videos;
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		let pathname = new URL(request.url).pathname;
		let params = new URL(request.url).searchParams;

		// if method is get return some HTML
		if (request.method === 'GET') {
			// Add this inside the fetch handler, alongside the other pathname checks
			if (pathname === '/status') {
				let key = params.get('key');
				if (!key) {
					return new Response('No key provided', { status: 400 });
				}

				let id = env.ANALYZER_STORE.idFromName('singleton');
				let analyzerStore = await env.ANALYZER_STORE.get(id);
				let video = await analyzerStore.getVideo(key);

				if (!video) {
					return new Response('Video not found', { status: 404 });
				}

				return Response.json({
					status: video.status,
					summary: video.description,
				});
			}

			return env.ASSETS.fetch(request);
		}

		if (request.method === 'PUT' || request.method === 'POST') {
			if (pathname === '/frames') {
				let bucketPath = params.get('bucketPath');
				console.log('bucketPath:', bucketPath);
				if (!bucketPath) {
					return new Response('No bucketPath provided', { status: 400 });
				}

				let basePath = params.get('basePath');
				if (!basePath) {
					return new Response('No basePath provided', { status: 400 });
				}

				let data = await request.arrayBuffer();
				await env.HACK_WEEK_BUCKET.put(bucketPath, data);

				let finalUpload = params.get('finalUpload');

				if (finalUpload === 'true') {
					let id = env.ANALYZER_STORE.idFromName('singleton');
					let analyzerStore = await env.ANALYZER_STORE.get(id);
					await analyzerStore.updateVideo(basePath, 'processing', 'Analyzing Frames using AI');

					let instance = await env.ANALYZE_IMAGE.create({
						params: { key: basePath },
					});

					return Response.json({
						id: instance.id,
						key: basePath,
						details: await instance.status(),
						link: `https://dash.cloudflare.com/8505f017ecf4c9b8855b331975d576fe/workers/workflows/analyze-image/instance/${instance.id}`,
					});
				} else {
					return new Response('Successfully uploaded', { status: 200 });
				}
			}

			if (pathname === '/') {
				let formData = await request.formData();
				let file = formData.get('file');
				if (file == undefined) {
					throw new Error('No file found');
				}

				if (typeof file === 'string') {
					throw new Error('Incorrect file format');
				}

				// Set the content type based on the file
				let responseHeaders = new Headers();
				responseHeaders.set('Content-Type', file.type);
				let uuid = uuidv4();
				let key = uuid + file.name;
				await env.HACK_WEEK_BUCKET.put(key, file);
				let bucketUrl = `https://pub-dbcf9f0bd3af47ca9d40971179ee62de.r2.dev/${key}`;
				let postURL = `https://poller.io/?url=${bucketUrl}&bucketPath=${uuid}`;

				// Create a new DO instance to track this upload
				let id = env.ANALYZER_STORE.idFromName('singleton');
				let analyzerStore = await env.ANALYZER_STORE.get(id);
				await analyzerStore.saveVideo(uuid, 'processing', 'Processing video');

				let ffmpegResponse = await fetch(postURL, { method: 'POST' });
				if (!ffmpegResponse.ok) {
					throw new Error(`Failed to process video: ${ffmpegResponse.statusText}`);
				} else {
				}

				return Response.json({
					key,
					bucketUrl,
					postURL,
					basePath: uuid,
				});
			}
		}

		return new Response('Method not allowed', { status: 405 });
	},
} satisfies ExportedHandler<Env>;

type Params = {
	key: string;
};

export class AnalyzeImage extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		let imageCaption = step.do('analyze image with AI', async () => {
			let listOfFiles = await this.env.HACK_WEEK_BUCKET.list({ prefix: event.payload.key });

			// await list of promises
			let captionPromises = listOfFiles.objects
				.filter((object) => object.key !== event.payload.key && object.key.includes('/') && object.key.includes('.png'))
				.map(async (object) => {
					let objectBody = await this.env.HACK_WEEK_BUCKET.get(object.key);
					if (objectBody == undefined) {
						throw new Error('Failed to fetch image');
					}

					let asArrayBuf = await objectBody.arrayBuffer();
					if (asArrayBuf == undefined) {
						throw new Error('Failed to parse image - bad upload');
					}

					let input = {
						image: [...new Uint8Array(asArrayBuf)],
						prompt: 'This image is a still from a video. Generate a caption for it.',
						max_tokens: 512,
					};
					let response = await this.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', input);
					return response.description;
				});

			let captions = await Promise.all(captionPromises);

			let content = `Here are my image captions: ${captions.join(' --- ')}`;

			let audioObject = listOfFiles.objects.find((object) => object.key !== event.payload.key && object.key.includes('.mp3'));
			if (audioObject == undefined) {
				console.log('NO AUDIO FOUND!');
			} else {
				console.log('AUDIO OBJECT', audioObject);
				console.log('THE KEY', audioObject.key);

				let audio = await this.env.HACK_WEEK_BUCKET.get(audioObject.key);
				if (audio != undefined) {
					console.log('HEY!');
					let asArrayBuf = await audio.arrayBuffer();
					if (asArrayBuf == undefined) {
						throw new Error('Failed to parse audio - bad upload');
					}

					console.log('HO!');

					const input = {
						audio: [...new Uint8Array(asArrayBuf)],
					};

					console.log('ABOUT TO CALL!');
					// @ts-ignore
					const audioResponse: any = await this.env.AI.run('@cf/openai/whisper', input);
					console.log('SUCCESS!');
					console.log('audioResponse', audioResponse);

					content += `\n\nHere is the audio transcription: ${audioResponse.text}`;
				} else {
					console.log('NO AUDIO RESPONSE');
				}
			}

			console.log('CONTENT:', content);

			let messages = [
				{
					role: 'system',
					content: `
						Your job is to take a set of captions from a video and try to summarize the video.
						Each caption does not have context from prior frames, so you may have to infer context from initial captions.
						Be brief and direct. Start by saying "A video of" and then explaining.
						Don't hedge by saying things like "it seems" or "I think".
						Don't refer to the captions, just summarize.
						`,
				},
				{
					role: 'user',
					content,
				},
			];
			let aiResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages });
			let res = {
				response: (aiResponse as any).response,
			};

			let id = this.env.ANALYZER_STORE.idFromName('singleton');
			let analyzerStore = await this.env.ANALYZER_STORE.get(id);

			await analyzerStore.updateVideo(event.payload.key, 'done', res.response);

			return res.response;
		});

		return imageCaption;
	}
}
