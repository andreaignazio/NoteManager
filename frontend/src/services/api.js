import axios from 'axios'

const domain = import.meta.env.VITE_API_URL || ''; 

const api = axios.create({
  
  baseURL: `${domain}/api`, 
  headers: {
    'Content-Type': 'application/json',
  },
});

//Add token to requests
api.interceptors.request.use( (config) =>
{
  const userToken = localStorage.getItem("auth_token")
  
  if(userToken){
    
    config.headers.Authorization = `Token ${userToken}` 
  }
  return config
})


export default api