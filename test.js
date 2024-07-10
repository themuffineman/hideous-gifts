fetch('https://hideous-gifts.onrender.com/api/generate-image',{
  method:"POST",
  body:JSON.stringify({
    "uploadedImage":"https://i.ibb.co/ccnh2Rx/photo-1494790108377-be9c29b29330.jpg",
    "targetImage":"https://i.ibb.co/y45rCdb/j-Ts0-Mw2-FQBCCIf-Jf-Da-Ihkg.webp"
  })
}).then( async (result)=>{
  const response = await result.json()
  console.log(response)
})