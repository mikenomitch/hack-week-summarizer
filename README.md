# Hack Week Project

## Goal

I should be able to upload a video and get a summary of that video generated with AI

## Steps

* Frontend with very simple upload field
* Uploaded file is part of Workflow
  * Upload file
  * On done, send URL to FFMPEG
  * FFMPEG
    * chops up into many frames, uploads each
    * FFMPEG grabs the audio and uploads it too
    * Sends a signal when it is done back to the Worker with its ID
  * When those are completely done
    * Workers AI is sent each frame - returns a description
    * Workers AI is sent the audio - returns the text
    * Workers AI is sent something that summarizes the whole video
  * Returns a description of the video


  * Worker takes uploaded files and sticks it in R2
  * When the R2 upload is done, it kicks off a Workflow to handle it
    * Upload