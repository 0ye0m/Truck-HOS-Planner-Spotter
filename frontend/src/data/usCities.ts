/**
 * Curated US city/state dataset for the trip-planner location picker.
 *
 * Design notes:
 * - Coordinates are intentionally NOT stored here. Picking a city fills the
 *   field with "City, ST", which the Django backend geocodes via Nominatim
 *   (cached + throttled). This keeps a single source of truth for geometry.
 * - `major` marks the largest freight hubs / metros so they rank first when
 *   several cities share a prefix (e.g. "Columbus OH" over "Columbus IN").
 * - Free-text entry is always allowed — the picker is an accelerator, not a
 *   restriction; any street address can still be typed and geocoded.
 */

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** city lists per state — "City,ST" is the exact string the backend geocodes. */
const CITIES_BY_STATE: Record<string, string[]> = {
  AL: ["Birmingham", "Montgomery", "Huntsville", "Mobile", "Tuscaloosa", "Dothan", "Auburn", "Decatur", "Madison", "Florence", "Gadsden", "Phenix City"],
  AK: ["Anchorage", "Fairbanks", "Juneau", "Wasilla", "Kenai"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Chandler", "Glendale", "Gilbert", "Scottsdale", "Tempe", "Peoria", "Yuma", "Flagstaff", "Surprise", "Kingman", "Nogales"],
  AR: ["Little Rock", "Fort Smith", "Fayetteville", "Springdale", "Jonesboro", "Rogers", "Conway", "North Little Rock", "Pine Bluff", "Hot Springs", "West Memphis", "Texarkana", "El Dorado"],
  CA: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Fresno", "Sacramento", "Long Beach", "Oakland", "Bakersfield", "Anaheim", "Stockton", "Riverside", "Santa Ana", "Ontario", "Modesto", "Moreno Valley", "Fontana", "Fremont", "San Bernardino", "Oxnard", "Hayward", "Rancho Cucamonga", "Palmdale", "Lancaster", "Visalia", "Concord", "Roseville", "Victorville", "Ventura", "Salinas", "Redding", "Santa Barbara", "Chula Vista", "Irvine", "San Mateo", "Eureka", "Truckee"],
  CO: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Lakewood", "Thornton", "Arvada", "Westminster", "Pueblo", "Greeley", "Grand Junction", "Boulder", "Longmont", "Limon"],
  CT: ["Bridgeport", "Stamford", "New Haven", "Hartford", "Waterbury", "Norwalk", "Danbury", "New Britain", "West Hartford", "Bristol"],
  DE: ["Wilmington", "Dover", "Newark", "Middletown", "Smyrna", "Seaford"],
  DC: ["Washington"],
  FL: ["Jacksonville", "Miami", "Tampa", "Orlando", "St. Petersburg", "Hialeah", "Tallahassee", "Fort Lauderdale", "Port St. Lucie", "Cape Coral", "Pembroke Pines", "Hollywood", "Gainesville", "Coral Springs", "Clearwater", "Palm Bay", "Lakeland", "West Palm Beach", "Daytona Beach", "Sarasota", "Fort Myers", "Naples", "Pensacola", "Ocala", "Bradenton", "Lake City", "Panama City"],
  GA: ["Atlanta", "Augusta", "Columbus", "Macon", "Savannah", "Athens", "Sandy Springs", "Roswell", "Warner Robins", "Albany", "Alpharetta", "Marietta", "Valdosta", "Dalton", "Brunswick", "Rome"],
  HI: ["Honolulu", "Pearl City", "Hilo", "Kailua"],
  ID: ["Boise", "Meridian", "Nampa", "Idaho Falls", "Pocatello", "Coeur d'Alene", "Twin Falls", "Burley"],
  IL: ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford", "Springfield", "Peoria", "Elgin", "Waukegan", "Champaign", "Bloomington", "Decatur", "Evanston", "Schaumburg", "Cicero", "Rock Island", "Quincy", "East St. Louis", "Carbondale", "Galesburg", "Effingham", "Moline"],
  IN: ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Carmel", "Fishers", "Bloomington", "Hammond", "Gary", "Muncie", "Lafayette", "Terre Haute", "Anderson", "Kokomo", "Columbus", "Greenfield", "Jeffersonville"],
  IA: ["Des Moines", "Cedar Rapids", "Davenport", "Iowa City", "Sioux City", "Waterloo", "Council Bluffs", "Ames", "Dubuque", "Ottumwa", "Mason City", "Fort Dodge"],
  KS: ["Wichita", "Overland Park", "Kansas City", "Olathe", "Topeka", "Lawrence", "Salina", "Manhattan", "Hutchinson", "Dodge City", "Garden City", "Hays", "Goodland"],
  KY: ["Louisville", "Lexington", "Bowling Green", "Owensboro", "Covington", "Florence", "Richmond", "Elizabethtown", "Paducah", "Frankfort", "London", "Corbin"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport", "Lafayette", "Lake Charles", "Kenner", "Bossier City", "Monroe", "Alexandria", "New Iberia", "Morgan City"],
  ME: ["Portland", "Lewiston", "Bangor", "South Portland", "Auburn", "Augusta", "Presque Isle", "Houlton"],
  MD: ["Baltimore", "Columbia", "Germantown", "Silver Spring", "Waldorf", "Ellicott City", "Glen Burnie", "Frederick", "Rockville", "Gaithersburg", "Hagerstown", "Salisbury", "Cumberland"],
  MA: ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell", "Brockton", "New Bedford", "Quincy", "Lynn", "Fall River", "Framingham", "Lawrence", "Waltham", "Pittsfield", "Westfield"],
  MI: ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Ann Arbor", "Lansing", "Flint", "Dearborn", "Livonia", "Troy", "Kalamazoo", "Battle Creek", "Saginaw", "Muskegon", "Traverse City", "Port Huron", "Marquette", "Sault Ste. Marie"],
  MN: ["Minneapolis", "Saint Paul", "Rochester", "Duluth", "Bloomington", "Plymouth", "Brooklyn Park", "St. Cloud", "Eagan", "Mankato", "Moorhead", "Brainerd", "Bemidji", "Alexandria", "Fergus Falls"],
  MS: ["Jackson", "Gulfport", "Southaven", "Hattiesburg", "Biloxi", "Meridian", "Tupelo", "Greenville", "Olive Branch", "Vicksburg", "McComb"],
  MO: ["Kansas City", "St. Louis", "Springfield", "Columbia", "Independence", "Lee's Summit", "O'Fallon", "St. Joseph", "Jefferson City", "Joplin", "Cape Girardeau", "Sikeston", "Hannibal"],
  MT: ["Billings", "Missoula", "Great Falls", "Bozeman", "Butte", "Helena", "Kalispell", "Miles City"],
  NE: ["Omaha", "Lincoln", "Bellevue", "Grand Island", "Kearney", "Fremont", "North Platte", "Norfolk", "Scottsbluff", "Alliance", "Sidney"],
  NV: ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Sparks", "Carson City", "Elko", "Winnemucca", "Fernley"],
  NH: ["Manchester", "Nashua", "Concord", "Dover", "Rochester", "Salem", "Portsmouth", "Berlin"],
  NJ: ["Newark", "Jersey City", "Paterson", "Elizabeth", "Edison", "Woodbridge", "Toms River", "Trenton", "Clifton", "Camden", "Brick", "Cherry Hill", "Vineland", "Atlantic City", "Bayonne", "Hoboken", "Sewell"],
  NM: ["Albuquerque", "Las Cruces", "Santa Fe", "Rio Rancho", "Roswell", "Farmington", "Clovis", "Hobbs", "Gallup", "Tucumcari", "Deming"],
  NY: ["New York", "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany", "New Rochelle", "Mount Vernon", "Schenectady", "Utica", "Binghamton", "Poughkeepsie", "Elmira", "Watertown", "Jamestown", "Plattsburgh", "White Plains", "Ogdensburg"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem", "Fayetteville", "Cary", "Wilmington", "High Point", "Concord", "Asheville", "Greenville", "Jacksonville", "Gastonia", "Rocky Mount", "Chapel Hill", "Burlington", "Lumberton"],
  ND: ["Fargo", "Bismarck", "Grand Forks", "Minot", "West Fargo", "Williston", "Dickinson", "Mandan", "Jamestown"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton", "Parma", "Canton", "Youngstown", "Lorain", "Hamilton", "Springfield", "Kettering", "Elyria", "Lakewood", "Zanesville", "Lima", "Mansfield", "Findlay", "Sandusky", "Marietta"],
  OK: ["Oklahoma City", "Tulsa", "Norman", "Broken Arrow", "Edmond", "Lawton", "Moore", "Midwest City", "Enid", "Stillwater", "Muskogee", "Ardmore", "McAlester", "Sallisaw"],
  OR: ["Portland", "Salem", "Eugene", "Gresham", "Hillsboro", "Beaverton", "Bend", "Medford", "Springfield", "Corvallis", "Albany", "Pendleton", "Ontario", "Burns", "Klamath Falls"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton", "Bethlehem", "Lancaster", "Harrisburg", "Altoona", "York", "Wilkes-Barre", "Williamsport", "State College", "Carlisle", "New Castle", "Bloomsburg"],
  RI: ["Providence", "Warwick", "Cranston", "Pawtucket", "Newport", "Woonsocket"],
  SC: ["Columbia", "Charleston", "North Charleston", "Mount Pleasant", "Rock Hill", "Greenville", "Spartanburg", "Sumter", "Florence", "Myrtle Beach", "Anderson", "Aiken", "Orangeburg"],
  SD: ["Sioux Falls", "Rapid City", "Aberdeen", "Brookings", "Watertown", "Mitchell", "Pierre", "Huron", "Spearfish"],
  TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Clarksville", "Murfreesboro", "Franklin", "Jackson", "Johnson City", "Kingsport", "Bristol", "Cleveland", "Cookeville", "Dyersburg", "Sevierville"],
  TX: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington", "Corpus Christi", "Plano", "Laredo", "Lubbock", "Garland", "Irving", "Amarillo", "Grand Prairie", "Brownsville", "McKinney", "Frisco", "Pasadena", "Mesquite", "Killeen", "McAllen", "Midland", "Beaumont", "Waco", "Carrollton", "Wichita Falls", "Abilene", "Odessa", "San Angelo", "Tyler", "Texarkana", "Longview", "College Station", "Round Rock", "Sugar Land", "Lewisville", "Harlingen", "Temple", "Del Rio", "Eagle Pass", "Pharr", "Edinburg", "Mission", "Baytown", "Sherman", "Victoria", "El Campo", "Brenham"],
  UT: ["Salt Lake City", "West Valley City", "Provo", "Orem", "Ogden", "St. George", "Sandy", "Layton", "Taylorsville", "Logan", "Lehi", "Cedar City", "Price", "Vernal", "Green River"],
  VT: ["Burlington", "South Burlington", "Rutland", "Barre", "Montpelier", "St. Albans", "White River Junction"],
  VA: ["Virginia Beach", "Norfolk", "Richmond", "Arlington", "Alexandria", "Chesapeake", "Hampton", "Newport News", "Portsmouth", "Roanoke", "Lynchburg", "Harrisonburg", "Charlottesville", "Danville", "Manassas", "Petersburg", "Fredericksburg", "Winchester", "Blacksburg", "Woodbridge", "Staunton"],
  WA: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue", "Everett", "Kent", "Yakima", "Renton", "Spokane Valley", "Federal Way", "Bellingham", "Kennewick", "Pasco", "Aberdeen", "Walla Walla", "Wenatchee", "Port Angeles", "Olympia"],
  WV: ["Charleston", "Huntington", "Morgantown", "Parkersburg", "Wheeling", "Fairmont", "Weirton", "Beckley", "Martinsburg", "Bluefield", "Clarksburg", "Princeton"],
  WI: ["Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine", "Appleton", "Waukesha", "Eau Claire", "Oshkosh", "Janesville", "West Allis", "La Crosse", "Sheboygan", "Wausau", "Stevens Point", "Beloit", "Superior", "Fond du Lac", "Oak Creek"],
  WY: ["Cheyenne", "Casper", "Laramie", "Gillette", "Rock Springs", "Sheridan", "Green River", "Evanston", "Riverton", "Cody", "Jackson", "Rawlins", "Torrington"],
};

/** Largest freight hubs / metros — rank above same-prefix smaller cities. */
const MAJOR_CITIES = new Set([
  "New York|NY", "Los Angeles|CA", "Chicago|IL", "Houston|TX", "Phoenix|AZ",
  "Philadelphia|PA", "Dallas|TX", "San Antonio|TX", "San Diego|CA", "Austin|TX",
  "Jacksonville|FL", "Columbus|OH", "Charlotte|NC", "Indianapolis|IN",
  "San Francisco|CA", "Seattle|WA", "Denver|CO", "Boston|MA", "Nashville|TN",
  "Detroit|MI", "Portland|OR", "Memphis|TN", "Louisville|KY", "Baltimore|MD",
  "Milwaukee|WI", "Atlanta|GA", "Kansas City|MO", "St. Louis|MO",
  "Cincinnati|OH", "Cleveland|OH", "Pittsburgh|PA", "Las Vegas|NV",
  "Salt Lake City|UT", "Birmingham|AL", "Tulsa|OK", "Oklahoma City|OK",
  "Fargo|ND", "Billings|MT", "Spokane|WA", "Des Moines|IA", "Omaha|NE",
  "Little Rock|AR", "Albuquerque|NM", "El Paso|TX", "Laredo|TX",
  "Ontario|CA", "Bakersfield|CA", "Amarillo|TX", "Cheyenne|WY", "Boise|ID",
  "Reno|NV", "Tucson|AZ", "Wichita|KS", "Richmond|VA", "Charleston|SC",
  "Greenville|SC", "Savannah|GA", "Providence|RI", "Hartford|CT",
  "Albany|NY", "Buffalo|NY", "Portland|ME", "Manchester|NH", "Burlington|VT",
  "Wilmington|DE", "Charleston|WV", "Jackson|MS", "Baton Rouge|LA",
  "Duluth|MN", "Grand Forks|ND", "Sioux Falls|SD", "Casper|WY",
  "Rock Springs|WY", "Missoula|MT", "Great Falls|MT",
  "Knoxville|TN", "Chattanooga|TN", "Harrisburg|PA", "Syracuse|NY",
  "Newark|NJ", "Columbia|SC", "Orlando|FL", "Tampa|FL", "Miami|FL",
  "Sacramento|CA", "Fresno|CA", "Trenton|NJ",
]);

export interface CityOption {
  city: string;
  state: string;
  label: string;
  stateName: string;
  major: boolean;
}

interface FlatCity {
  city: string;
  lower: string;
  state: string;
  stateName: string;
  major: boolean;
  label: string;
  lowerLabel: string;
}

const FLAT: FlatCity[] = Object.entries(CITIES_BY_STATE).flatMap(
  ([state, cities]) =>
    cities.map((city) => ({
      city,
      lower: city.toLowerCase(),
      state,
      stateName: STATE_NAMES[state] ?? state,
      major: MAJOR_CITIES.has(`${city}|${state}`),
      label: `${city}, ${state}`,
      lowerLabel: `${city}, ${state}`.toLowerCase(),
    }))
);

export const ALL_CITY_COUNT = FLAT.length;

/** Ordered list of the biggest freight hubs, used for the empty-focus panel. */
const HUB_PRIORITY = [
  "Chicago|IL", "Los Angeles|CA", "Dallas|TX", "Atlanta|GA",
  "New York|NY", "Houston|TX", "Phoenix|AZ", "Denver|CO",
  "Seattle|WA", "Miami|FL", "Memphis|TN", "Columbus|OH",
];

/** Popular freight hubs for the "start typing" state of the picker. */
export function topHubs(limit = 6): CityOption[] {
  const byKey = new Map(FLAT.filter((c) => c.major).map((c) => [`${c.city}|${c.state}`, c]));
  const ordered: FlatCity[] = [];
  for (const key of HUB_PRIORITY) {
    const c = byKey.get(key);
    if (c) ordered.push(c);
  }
  for (const c of FLAT) {
    if (ordered.length >= limit) break;
    if (c.major && !ordered.includes(c)) ordered.push(c);
  }
  return ordered.slice(0, limit).map((c) => ({
    city: c.city, state: c.state, label: c.label,
    stateName: c.stateName, major: c.major,
  }));
}

/** A candidate matches a state code, state name, or "City, ST" label. */
function scoreCandidate(c: FlatCity, q: string): number {
  // Exact / prefix match on the "city, st" label — strongest signal.
  if (c.lowerLabel === q) return -1;
  if (c.lower.startsWith(q)) return c.major ? 0 : 3;
  const wordStart = c.lower.indexOf(` ${q}`);
  if (wordStart !== -1) return (c.major ? 1 : 4) + 0.5;
  if (c.lower.includes(q)) return (c.major ? 2 : 5) + 1;
  // State matching: "il" lists Illinois cities, "texas" lists Texas.
  if (c.state.toLowerCase() === q) return 6;
  if (c.stateName.toLowerCase().startsWith(q)) return 6.5;
  return Number.POSITIVE_INFINITY;
}

/**
 * Search the dataset. Returns up to `limit` options ranked so that prefix
 * matches on major hubs come first, then other prefix matches, then
 * substring / state matches. Sorted alphabetically within equal scores.
 */
export function searchCities(rawQuery: string, limit = 40): CityOption[] {
  const q = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 2) return [];

  const scored: { c: FlatCity; s: number }[] = [];
  for (const c of FLAT) {
    const s = scoreCandidate(c, q);
    if (s !== Number.POSITIVE_INFINITY) scored.push({ c, s });
  }

  scored.sort((a, b) => a.s - b.s || a.c.lower.localeCompare(b.c.lower));

  const seen = new Set<string>();
  const out: CityOption[] = [];
  for (const { c } of scored) {
    if (seen.has(c.lowerLabel)) continue;
    seen.add(c.lowerLabel);
    out.push({
      city: c.city,
      state: c.state,
      label: c.label,
      stateName: c.stateName,
      major: c.major,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** True when the free-text value exactly matches a dataset label. */
export function isKnownCityLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return FLAT.some((c) => c.lowerLabel === v);
}
