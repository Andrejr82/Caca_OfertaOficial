async function test() {
  const url = "http://localhost:3000/api/img?url=" + encodeURIComponent("https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=500&q=80");
  try {
    const res = await fetch(url);
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Text:", text.substring(0, 100));
  } catch(e) {
    console.log("Error:", e.message);
  }
}
test();
