import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@/style.css';
import App from './App.vue';
import router from './router';
import useAuthStore from './stores/auth';

const pinia = createPinia()

const app = createApp(App);

//app.use(useAuthStore);
app.use(router);
app.use(pinia)
app.mount('#app');