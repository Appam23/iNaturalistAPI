/* ===== API AND PAGE ELEMENTS ===== */

const API_URL = "https://api.inaturalist.org/v1";

const placeForm = document.querySelector("#place-form");
const placeSearch = document.querySelector("#place-search");
const placeSelect = document.querySelector("#place-select");

const identificationForm = document.querySelector(
  "#identification-form"
);

const startDate = document.querySelector("#start-date");
const endDate = document.querySelector("#end-date");

const results = document.querySelector("#results");
const statusMessage = document.querySelector("#status");

/* ===== REQUEST DATA FROM THE API ===== */

async function getData(endpoint, parameters = {}) {
  const query = new URLSearchParams(parameters);
  const response = await fetch(`${API_URL}${endpoint}?${query}`);

  if (!response.ok) {
    throw new Error(`The API request failed (${response.status}).`);
  }

  return response.json();
}

/* ===== SEARCH FOR PLACES ===== */

placeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const searchTerm = placeSearch.value.trim();

  if (searchTerm.length < 2) {
    statusMessage.textContent = "Enter at least two characters.";
    return;
  }

  const button = placeForm.querySelector("button");
  button.disabled = true;

  identificationForm.hidden = true;
  placeSelect.replaceChildren();
  results.replaceChildren();
  statusMessage.textContent = "Searching for places...";

  try {
    const data = await getData("/places/autocomplete", {
      q: searchTerm
    });

    if (data.results.length === 0) {
      statusMessage.textContent =
        "No places found. Try a different place name.";
      return;
    }

    for (const place of data.results) {
      const option = document.createElement("option");

      option.value = place.id;
      option.textContent = place.display_name || place.name;

      placeSelect.append(option);
    }

    identificationForm.hidden = false;

    statusMessage.textContent =
      "Select a place, choose optional dates, then find identifications.";
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

/* ===== REQUEST IDENTIFICATIONS ===== */

identificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!placeSelect.value) return;

  if (
    startDate.value &&
    endDate.value &&
    startDate.value > endDate.value
  ) {
    statusMessage.textContent =
      "The start date must be on or before the end date.";
    return;
  }

  // Lock both forms while this search is running.
  const buttons = document.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  results.replaceChildren();
  statusMessage.textContent = "Loading identifications...";

  try {
    const parameters = {
      place_id: placeSelect.value,
      per_page: 100,
      current: "true"
    };

    // These filter the observation date, not identification creation date.
    if (startDate.value) {
      parameters.observed_d1 = startDate.value;
    }

    if (endDate.value) {
      parameters.observed_d2 = endDate.value;
    }

    const data = await getData("/identifications", parameters);

    /* ===== STRETCH: REMOVE DUPLICATE TAXA ===== */

    const uniqueIdentifications = new Map();

    for (const identification of data.results) {
      const taxonId = identification.taxon?.id;

      if (taxonId && !uniqueIdentifications.has(taxonId)) {
        uniqueIdentifications.set(taxonId, identification);
      }
    }

    const identifications = [...uniqueIdentifications.values()];

    if (identifications.length === 0) {
      statusMessage.textContent =
        "No identifications found. Try another place or date range.";
      return;
    }

    /*
      Identification records can contain only basic taxon information.
      Fetch full taxon details to get reliable names and photographs.
    */
    // Fetch taxon details in groups of 20.
    const taxonIds = [...uniqueIdentifications.keys()];

   
    const taxaById = new Map();
    const batchSize = 20;

    for (let i = 0; i < taxonIds.length; i += batchSize) {
    const batch = taxonIds.slice(i, i + batchSize);

    const taxaData = await getData(`/taxa/${batch.join(",")}`);

    for (const taxon of taxaData.results) {
        taxaById.set(taxon.id, taxon);
    }
    }

    for (const identification of identifications) {
      const taxon =
        taxaById.get(identification.taxon.id) ||
        identification.taxon;

      displayCard(taxon);
    }

    const placeName = placeSelect.selectedOptions[0].textContent;

    statusMessage.textContent =
      `Showing ${identifications.length} unique taxa in ${placeName}, ` +
      `from ${data.results.length} identification records.`;
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
});

/* ===== CREATE AN IDENTIFICATION CARD ===== */

function displayCard(taxon) {
  const card = document.createElement("article");
  card.className = "card";

  const name =
    taxon.preferred_common_name ||
    taxon.name ||
    `Taxon ${taxon.id}`;

  const photo = taxon.default_photo;
  const photoUrl = photo?.medium_url || photo?.url;

  const noPhoto = document.createElement("div");
  noPhoto.className = "no-photo";
  noPhoto.textContent = "No image available";

  if (photoUrl) {
    const image = document.createElement("img");

    image.src = photoUrl;
    image.alt = name;
    image.loading = "lazy";

    image.addEventListener("error", () => {
      image.replaceWith(noPhoto);
    }, { once: true });

    card.append(image);
  } else {
    card.append(noPhoto);
  }

  const content = document.createElement("div");
  content.className = "card-content";

  const heading = document.createElement("h3");
  heading.textContent = name;
  content.append(heading);

  if (taxon.name) {
    const scientificName = document.createElement("p");
    scientificName.className = "scientific-name";
    scientificName.textContent = taxon.name;
    content.append(scientificName);
  }

  const link = document.createElement("a");
  link.href = `https://www.inaturalist.org/taxa/${taxon.id}`;
  link.textContent = "View on iNaturalist";
  content.append(link);

  if (photo?.attribution) {
    const credit = document.createElement("p");
    credit.className = "photo-credit";
    credit.textContent = photo.attribution;
    content.append(credit);
  }

  card.append(content);
  results.append(card);
}