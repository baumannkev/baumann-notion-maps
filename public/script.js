document.addEventListener("DOMContentLoaded", () => {
    const databaseSelect = document.getElementById("databaseSelect");
    const mapSection = document.getElementById("mapSection");
    let map;
    let markerGroup;
  
    // Dedupe by ID
    function dedupe(dbs) {
      const seen = new Set();
      return dbs.filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
    }
  
    function getPageTitle(page) {
      const key = Object.keys(page.properties)
        .find(k => page.properties[k].type === "title");
      const arr = page.properties[key]?.title || [];
      return arr[0]?.plain_text || "No title";
    }
  
    function getAddress(page) {
      return getPageTitle(page);
    }
  
    async function geocodeAddress(addr) {
      const url = `/.netlify/functions/server/api/geocode?address=${encodeURIComponent(addr)}`;
      let res = await fetch(url);
      let j = await res.json();
      if (j.success) return { lat: +j.lat, lon: +j.lon };
  
      // retry with ", CA, USA"
      const fallback = addr.includes("CA") || addr.includes("USA")
        ? null
        : `${addr}, CA, USA`;
      if (fallback) {
        res = await fetch(`/.netlify/functions/server/api/geocode?address=${encodeURIComponent(fallback)}`);
        j = await res.json();
        if (j.success) return { lat: +j.lat, lon: +j.lon };
      }
      console.warn("Geocode fail:", addr);
      return null;
    }
  
    function initMap() {
      map = L.map("map").setView([37.7749, -122.4194], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      markerGroup = L.featureGroup().addTo(map);
    }
  
    async function loadDatabases() {
      const res = await fetch(`/.netlify/functions/server/api/databases`);
      const { results } = await res.json();
      dedupe(results).forEach(db => {
        const opt = document.createElement("option");
        opt.value = db.id;
        opt.textContent = db.title[0]?.plain_text || "(Untitled)";
        databaseSelect.appendChild(opt);
      });
    }
  
    databaseSelect.addEventListener("change", async e => {
      const dbId = e.target.value;
      if (!dbId) return mapSection.style.display = "none";
  
      markerGroup.clearLayers();
      const res = await fetch(`/.netlify/functions/server/api/databases/${dbId}/pages`);
      const { results } = await res.json();
  
      // geocode all in parallel
      const jobs = results.map(async page => {
        const title = getPageTitle(page);
        const addr  = getAddress(page);
  
        // try props first
        let lat = page.properties.Latitude?.rich_text[0]?.plain_text;
        let lon = page.properties.Longitude?.rich_text[0]?.plain_text;
        if (lat && lon) {
          return { title, addr, lat: +lat, lon: +lon };
        }
        return { title, addr, ...(await geocodeAddress(addr) || {}) };
      });
  
      const spots = await Promise.all(jobs);
      spots.forEach(s => {
        if (s.lat && s.lon) {
          L.marker([s.lat, s.lon])
           .addTo(markerGroup)
           .bindPopup(`<strong>${s.title}</strong><br>${s.addr}`);
        }
      });
  
      mapSection.style.display = "block";
      setTimeout(() => {
        map.invalidateSize();
        if (markerGroup.getLayers().length)
          map.fitBounds(markerGroup.getBounds(), { padding: [20,20] });
      }, 100);
    });
  
    initMap();
    loadDatabases();
  });
  