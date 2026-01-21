import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@/style.css';
import App from './App.vue';
import router from './router';
import useAuthStore from './stores/auth';
import animatedPlaceholder from '@/directives/animatedPlaceholder'

const pinia = createPinia()

const app = createApp(App);

//app.use(useAuthStore);
app.use(pinia)
app.use(router);
app.directive('animated-placeholder', animatedPlaceholder)

app.mount('#app');