# Hack Week Project

## Goal

I should be able to upload a video and get a summary of that video generated with AI

## Steps

* Expose summary
  * Create the workflow first
  * Pass the instance ID to the frontend initially
  * Use this instead of the basePath for getting the correct Workflow ID later

* Audio
  * FFMPEG grabs audio (do this locally!)
  * Audio gets uploaded to its own spot in the bucket
  * Audio is filtered out of the image list
  * Audio is sent to the AI
  * Summary incorporates the audio
