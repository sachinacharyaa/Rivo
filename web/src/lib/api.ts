import axios from "axios";

const isProd = import.meta.env.PROD;
const apiUrl = import.meta.env.VITE_API_URL || (isProd ? "/api" : "http://localhost:4000/api");

if (!import.meta.env.VITE_API_URL) {
  console.warn(`VITE_API_URL is not set; falling back to ${apiUrl}.`);
}

export const api = axios.create({
  baseURL: apiUrl,
});
