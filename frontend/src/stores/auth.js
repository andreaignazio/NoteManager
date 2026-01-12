import { defineStore } from 'pinia'
import api from '@/services/api'

const TOKEN_KEY = 'auth_token'

const useAuthStore = defineStore('authStore', {
    state: () => ({    
        token: null,
        user: null,    
    }),
    getters: {
        isAuthenticated: (state) => !!state.token
    },
    actions:{
       async init() {
            const storedToken = localStorage.getItem('auth_token')
            
            if (storedToken) {
                this.token = storedToken
                await this.fetchMe()
                console.log("Token ripristinato da LocalStorage")
            } else {this.token = null}
        },
        async fetchMe(){
             try {
                const response = await api.get('/auth/users/me/')
                this.user = response.data
             } catch (error) {
                this.logout() 
             }
        },

        async login(username, password) {
            try{
            const credentials = {
                'username': username,
                'password': password} 
            const response = await api.post('/auth/token/login/', credentials)
            this.token = await response.data.auth_token
            localStorage.setItem('auth_token', this.token)

             await this.fetchMe()
            
            }catch(error){
            console.log("Login error:", error)
            throw error
            }
            },
        async register(username, password, repassword){
            try{
                const credentials = {'username': username,
                'password': password, 're_password': repassword}
                const response = await api.post('/auth/users/', credentials) 
            } catch(error){
                console.log("Register error:", error)
                throw error
            }
        },
        async logout(){
            try {
                await api.post('/auth/token/logout/')
            }
        catch(error){
            console.warn("Logout error:", error)
            
        } finally {
            this.token = null
            this.user = null
            localStorage.removeItem("auth_token")
            
        }
        }
},
})

export default useAuthStore