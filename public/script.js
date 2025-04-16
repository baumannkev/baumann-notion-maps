document.addEventListener("DOMContentLoaded", () => {
    const databaseSelect = document.getElementById("databaseSelect");
    const mapSection = document.getElementById("mapSection");
    let map; // Leaflet map instance
    let markerGroup; // Feature group for markers
  
    // Deduplicate databases by ID
    function deduplicateDatabases(databases) {
      const seen = new Set();
      return databases.filter((db) => {
        if (seen.has(db.id)) {
          return false;
        }
        seen.add(db.id);
        return true;
      });
    }
  
    // Get the title from the Notion page by dynamically finding the title property
    function getPageTitle(page) {
      const titlePropKey = Object.keys(page.properties).find(
        (key) => page.properties[key].type === "title"
      );
      if (!titlePropKey) return "No title property found";
      const titleArr = page.properties[titlePropKey]?.title || [];
      return titleArr.length > 0 ? titleArr[0].plain_text : "No title text";
    }
  
    // In this case, we assume the title property holds the address
    function getAddress(page) {
      return getPageTitle(page);
    }
  
    // Geocode an address using the backend endpoint.
    // If no results are found, it retries with ", CA, USA" appended.
    async function geocodeAddress(address) {
      try {
        let res = await fetch(
          `/api/geocode?address=${encodeURIComponent(address)}`
        );
        let data = await res.json();
        if (data.success) {
          return { lat: parseFloat(data.lat), lon: parseFloat(data.lon) };
        } else {
          console.warn(`Initial geocoding failed for ${address}: ${data.message}`);
          // If the address doesn't include "ca" or "usa", try appending ", CA, USA"
          if (
            !address.toLowerCase().includes("ca") &&
            !address.toLowerCase().includes("usa")
          ) {
            const newAddress = address + ", CA, USA";
            console.log(`Retrying geocoding with: ${newAddress}`);
            let res2 = await fetch(
              `/api/geocode?address=${encodeURIComponent(newAddress)}`
            );
            let data2 = await res2.json();
            if (data2.success) {
              return { lat: parseFloat(data2.lat), lon: parseFloat(data2.lon) };
            } else {
              console.error(
                `Geocoding retry failed for ${newAddress}: ${data2.message}`
              );
              return null;
            }
          }
          return null;
        }
      } catch (error) {
        console.error("Error in geocoding:", error);
        return null;
      }
    }
  
    // Initialize the Leaflet map.
    function initMap() {
      map = L.map("map").setView([37.7749, -122.4194], 12); // Default center: San Francisco
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
  
      // Create a feature group to hold all markers.
      markerGroup = L.featureGroup().addTo(map);
    }
  
    // Load databases from the backend and populate the select element.
    async function loadDatabases() {
      const res = await fetch("/api/databases");
      const data = await res.json();
      let databases = data.results;
      databases = deduplicateDatabases(databases);
      databases.forEach((db) => {
        const option = document.createElement("option");
        option.value = db.id;
        option.textContent = db.title[0]?.plain_text || "(Untitled Database)";
        databaseSelect.appendChild(option);
      });
    }
  
    // Load pages from the selected database and add markers to the map.
    // This version processes geocoding concurrently.
    async function loadPages(dbId) {
      const res = await fetch(`/api/databases/${dbId}/pages`);
      const data = await res.json();
  
      // Clear existing markers from the map.
      markerGroup.clearLayers();
  
      // Process all pages concurrently using Promise.all.
      const geocodePromises = data.results.map(async (page) => {
        const pageTitle = getPageTitle(page);
        const address = getAddress(page);
  
        let lat = null,
          lon = null;
        // Check for existing latitude/longitude from Notion properties.
        if (
          page.properties["Latitude"] &&
          page.properties["Latitude"].type === "rich_text" &&
          page.properties["Latitude"].rich_text.length > 0
        ) {
          lat = parseFloat(page.properties["Latitude"].rich_text[0].plain_text);
        }
        if (
          page.properties["Longitude"] &&
          page.properties["Longitude"].type === "rich_text" &&
          page.properties["Longitude"].rich_text.length > 0
        ) {
          lon = parseFloat(page.properties["Longitude"].rich_text[0].plain_text);
        }
        // If coordinates are missing, perform geocoding.
        if (!lat || !lon) {
          const geo = await geocodeAddress(address);
          if (geo) {
            lat = geo.lat;
            lon = geo.lon;
          }
        }
        return { pageTitle, address, lat, lon };
      });
  
      // Wait for all geocoding to complete.
      const results = await Promise.all(geocodePromises);
  
      // Add markers for pages where geocoding succeeded.
      results.forEach(({ pageTitle, address, lat, lon }) => {
        if (lat && lon) {
          const marker = L.marker([lat, lon]).bindPopup(
            `<strong>${pageTitle}</strong><br>${address}`
          );
          markerGroup.addLayer(marker);
        }
      });
  
      // Reveal the map section.
      mapSection.style.display = "block";
      setTimeout(() => {
        map.invalidateSize();
        if (markerGroup.getLayers().length > 0) {
          map.fitBounds(markerGroup.getBounds(), { padding: [20, 20] });
        }
      }, 100);
    }
  
    databaseSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        loadPages(e.target.value);
      } else {
        mapSection.style.display = "none";
      }
    });
  
    initMap();
    loadDatabases();
  });
  