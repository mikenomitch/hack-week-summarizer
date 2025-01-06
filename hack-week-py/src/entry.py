from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse


async def on_fetch(request, env):
    import asgi

    return await asgi.fetch(app, request, env)


app = FastAPI()


@app.get("/", response_class=HTMLResponse)
async def home():
    return """
    <html>
        <head>
            <title>Some HTML in here</title>
        </head>
        <body>
            <h1>Summarize a video:</h1>
            <form action="https://hack-week-ts.mike-test-ent-account.workers.dev/" enctype="multipart/form-data" method="post">
                <input name="file" type="file" accept="image/*">
                <input type="submit">
            </form>
        </body>
    </html>
    """


@app.post("/image-upload")
async def image_upload(req: Request):
    # contents = await file.read()
    # You can add code here to process the image if needed
    return "okay"


@app.get("/env")
async def env(req: Request):
    env = req.scope["env"]
    return {
        "message": "Here is an example of getting an environment variable: "
        + env.MESSAGE
    }
