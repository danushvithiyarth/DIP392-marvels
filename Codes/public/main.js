function showMyDevices() {
    fetch('/api/devices')
      .then(res => res.json())
      .then(data => {
        const ul = document.getElementById("myDevices");
        ul.innerHTML = data.map(d => `<li>${d.name}</li>`).join('');
      });
  }
  
  function loadOrders(type) {
    fetch(`/api/orders/${type}`)
      .then(res => res.json())
      .then(data => {
        const ul = document.getElementById("orderList");
        ul.innerHTML = data.map(d => `<li>Order #${d.id} - ${d.status}</li>`).join('');
      });
  }
  
  function renderMarketplace() {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        const div = document.getElementById("products");
        div.innerHTML = data.map(p => `
          <div>
            <h3>${p.name}</h3>
            <p>Price: $${p.price}</p>
            <button onclick="addToCart(${p.id})">Add to Cart</button>
          </div>
        `).join('');
      });
  }
  
  function addToCart(product_id) {
    fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id })
    })
    .then(res => res.json())
    .then(() => renderCart());
  }
  
  function renderCart() {
    fetch('/api/cart')
      .then(res => res.json())
      .then(data => {
        const ul = document.getElementById("cartItems");
        ul.innerHTML = data.map(i => `<li>${i.name} - $${i.price}</li>`).join('');
      });
  }
  
  window.onload = () => {
    if (document.getElementById("products")) renderMarketplace();
    if (document.getElementById("cartItems")) renderCart();
    if (document.getElementById("myDevices")) showMyDevices();
    if (document.getElementById("orderList")) loadOrders('current');
  };
  
