import { mount } from "svelte"
import "./app.css"
import App from "./App.svelte"
import { registerSerwist } from "./lib/pwa/pwa"

const target = document.getElementById("app")
if (!target) {
  throw new Error("Root element #app is missing from index.html")
}

const app = mount(App, { target })

if (import.meta.env.PROD) {
  registerSerwist()
}

export default app
