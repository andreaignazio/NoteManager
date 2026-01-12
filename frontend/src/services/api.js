import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  //headers: {'Content-Type': 'application/json'}
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

//api.defaults.headers.post['Content-Type'] = 'application/json';

export default api