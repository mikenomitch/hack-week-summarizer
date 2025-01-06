import { v4 as uuidv4 } from 'uuid';
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

interface Env {
	HACK_WEEK_BUCKET: R2Bucket;
	AI: Ai;
	ANALYZE_IMAGE: Workflow;
}

export default {
	async fetch(request, env): Promise<Response> {
		// if method is get return some HTML
		if (request.method === 'GET') {
			return new Response(
				`
    <html>
        <head>
            <title>Some HTML in here</title>
        </head>
        <body>
            <h1>Summarize a video:</h1>
            <form action="/" enctype="multipart/form-data" method="post">
                <input name="file" type="file" accept="image/*">
                <input type="submit">
            </form>
        </body>
    </html>
		`,
				{
					headers: {
						'Content-Type': 'text/html',
					},
				}
			);
		}

		if (request.method === 'PUT' || request.method === 'POST') {
			const key = uuidv4() + '.jpg';

			let formData = await request.formData();
			const file = formData.get('file');
			if (file == undefined) {
				throw new Error('No file found');
			}

			if (typeof file === 'string') {
				throw new Error('Incorrect file format');
			}

			// Set the content type based on the file
			const responseHeaders = new Headers();
			responseHeaders.set('Content-Type', file.type);

			await env.HACK_WEEK_BUCKET.put(key, file);

			let instance = await env.ANALYZE_IMAGE.create({
				params: { key },
			});

			return Response.json({
				id: instance.id,
				key,
				details: await instance.status(),
				link: `https://dash.cloudflare.com/8505f017ecf4c9b8855b331975d576fe/workers/workflows/analyze-image/instance/${instance.id}`,
			});
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
			// let object = await this.env.HACK_WEEK_BUCKET.get(event.payload.key);

			let listOfFiles = await this.env.HACK_WEEK_BUCKET.list({ prefix: 'video_frames' });

			// await list of promises
			let captionPromises = listOfFiles.objects.map(async (object) => {
				console.log('KEY: ', object.key);

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
			console.log('ALL MY CAPTIONS: ', captions);

			const messages = [
				{
					role: 'system',
					content: `
						Your job is to take a set of images and generate captions for them.
						Each caption does not have context from prior frames, so you may have to infer context from initial captions.
						Be brief and direct. Start by saying "A video of" and then explaining.
						Don't hedge by saying things like "it seems" or "I think".
						Don't refer to "the captions", just summarize.
						`,
				},
				{
					role: 'user',
					content: `Here are my image captions: ${captions.join(' --- ')}`,
				},
			];

			const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages });

			console.log('THE SUMMARY RESPONSE IS: ', JSON.stringify(response));

			return JSON.stringify(response);
		});

		console.log('THE IMAGE IS: ', imageCaption);

		return imageCaption;
	}
}
