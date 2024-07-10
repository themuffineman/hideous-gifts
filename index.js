import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import {config} from 'dotenv';

config()
const app = express()
app.listen(8080, () => console.log('listening on 8080'))
app.use(cors())
app.use(bodyParser.json())

app.post('/api/generate-image',async (req,res)=>{
  let isImageDone = false
  let generatedImage;
  try{
    const {uploadedImage, targetImage} = req.body;
    console.log('Received Request:', uploadedImage, targetImage)
    
    const apiResponse = await fetch('https://api.imagepipeline.io/faceswap/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.API_KEY
      },
      body: JSON.stringify({
        "input_face": uploadedImage,
        "input_image": targetImage
      })
    })
    
    if(!apiResponse.ok){
      const error = await apiResponse.json()
      console.log(error)
      throw Error('Failed to create image')
    }
    
    const resBody = await apiResponse.json();
    console.log('Image Created: ', resBody.id)
    
    while(isImageDone !== true){
      await new Promise(resolve => setTimeout(resolve, 2000));
      const generatedRes = await fetch(`https://api.imagepipeline.io/faceswap/v1/status/${resBody.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': process.env.API_KEY
        }
      })
      if(!generatedRes.ok){
        const resError = await generatedRes.json()
        console.log(resError)
        throw Error(`Failed to poll`)
      }
      const pollingRes = await generatedRes.json();
      console.log('Polling Status:', pollingRes.status)
      if(pollingRes.status === 'SUCCESS'){
        generatedImage = pollingRes.download_urls[0]
        isImageDone = true
        console.log('Polling Success:', generatedImage)
      }
    }
    
    return res.json({url: generatedImage})
  }catch(err){
    console.error(err.message)
    return res.status(500).json({error: err.message})
  }
})
app.post('/api/upscale-image', async (req, res)=>{
  let isImageDone = false
  let upscaledImage;
  try{
    const {image} = req.body;

    const apiResponse = await fetch('https://api.imagepipeline.io/superresolution/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.API_KEY
      },
      body: JSON.stringify({
        "model_name": "RealESRGAN_x4plus",
        "init_image": `${image}`,
        "scale_factor": 4,
        "tile": 150,
      })
    })

    if(!apiResponse.ok){
      throw Error('Failed to upscale image')
    }

    const {id} = await apiResponse.json();
    console.log('Upscale Id: ', id)

    while(isImageDone !== true){
      await new Promise(resolve => setTimeout(resolve, 2000));
      const generatedRes = await fetch(`https://api.imagepipeline.io/superresolution/v1/status/${id}`,{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': process.env.API_KEY
        }
      })
      if(!generatedRes.ok){
        throw Error('Failed to poll')
      }
      const pollingRes = await generatedRes.json();
      if(pollingRes.status === 'SUCCESS'){
        generatedImage = pollingRes.downloadUrls[0]
        isImageDone = true
      }
    }

    return res.json({url: upscaledImage})
  }catch(err){
    console.error(err.message)
  }
})