import axios from "axios";

export async function register(data) {
  const response = await axios.post("http://localhost:8000/api/auth/register", data);
  return response.data;
}