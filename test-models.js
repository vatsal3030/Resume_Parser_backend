import axios from 'axios';
async function test() {
  const res = await axios.get("https://openrouter.ai/api/v1/models");
  res.data.data.forEach(m => {
    if (m.id.includes("llama") && m.id.includes("free")) console.log(m.id);
  });
}
test();
