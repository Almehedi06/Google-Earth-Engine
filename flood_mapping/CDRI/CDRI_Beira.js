// Import relevant datasets and define constants
var gsw = ee.Image("JRC/GSW1_2/GlobalSurfaceWater");
var hydrosheds = ee.Image("WWF/HydroSHEDS/03VFDEM");
var geometry = ee.Geometry.Polygon(
  [[[34.760464992014356, -19.59878701610058],
    [34.760464992014356, -19.852157349456057],
    [35.00834402033467, -19.852157349456057],
    [35.00834402033467, -19.59878701610058]]], null, false);
var valid_nonflooded = ee.FeatureCollection("projects/ee-almehedi06/assets/P3_Beira_valid_noflood");
var valid_flooded = ee.FeatureCollection("projects/ee-almehedi06/assets/P3_Beira_valid_flooded");
var beira_valid_georef = ee.Image("projects/ee-almehedi06/assets/Beira_valid_georef");

// Dates for flood and dry periods
var floodStart = '2019-03-10';
var floodEnd = '2019-03-20';
var dryStart = '2018-11-01';
var dryEnd = '2019-02-25';

// Sentinel-1 collection filtering
var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
  .filter(ee.Filter.eq('resolution_meters', 10))
  .filterBounds(geometry)
  .select('VV');

// Define flood and dry collections
var floodCollection = collection.filterDate(floodStart, floodEnd);
var dryCollection = collection.filterDate(dryStart, dryEnd);

// Mosaicking and clipping images
var flood = floodCollection.mosaic().clip(geometry);
var dry = dryCollection.mosaic().clip(geometry);

// Add raw layers to the map
Map.addLayer(flood, {min: -25, max: 0}, 'Flood (Raw)', false);
Map.addLayer(dry, {min: -25, max: 0}, 'Dry (Raw)', false);

// Apply filtering
var floodFiltered = ee.Image(toDB(RefinedLee(toNatural(flood))));
var dryFiltered = ee.Image(toDB(RefinedLee(toNatural(dry))));

// Add filtered layers to the map
Map.addLayer(floodFiltered, {min: -25, max: 0}, 'Flood (Filtered)', false);
Map.addLayer(dryFiltered, {min: -25, max: 0}, 'Dry (Filtered)', false);

// Define threshold for flood detection
var division = floodFiltered.divide(dryFiltered);
var divThreshold = 1.6;
var flooded = division.gt(divThreshold).rename('water').selfMask();

// Add initial flood detection layer
Map.addLayer(flooded, {min: 0, max: 1, palette: ['orange']}, 'Initial Flood Area', false);

// Mask permanent water areas
var permanentWater = gsw.select('seasonality').gte(5).clip(geometry);
flooded = flooded.where(permanentWater, 0).selfMask();

// Add permanent water areas to the map
Map.addLayer(permanentWater.selfMask(), {min: 0, max: 1, palette: ['blue']}, 'Permanent Water');

// Slope mask using HydroSHEDS DEM
var slopeThreshold = 5;
var terrain = ee.Algorithms.Terrain(hydrosheds);
var slope = terrain.select('slope');
flooded = flooded.updateMask(slope.lt(slopeThreshold));

// Add slope and flood areas to the map
Map.addLayer(slope.gte(slopeThreshold).selfMask(), {min: 0, max: 1, palette: ['cyan']}, 'Steep Areas', false);

// Remove isolated pixels by connected pixel count
var connectedPixelCount = flooded.connectedPixelCount({
  maxSize: 128,
  eightConnected: true
});
flooded = flooded.updateMask(connectedPixelCount.gt(1));

// Add flooded areas to the map
Map.addLayer(flooded, {min: 0, max: 1, palette: ['red']}, 'Flooded Areas');

// Calculate affected area (in hectares)
var stats = flooded.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  tileScale: 16
});
print('Flooded Area (Ha)', ee.Number(stats.get('water')).divide(10000));

// Add reference flooded areas to the map
Map.addLayer(beira_valid_georef, {}, 'Valid Flooded Areas');

// Convert binary raster to vector polygons
var vectorsFilled = flooded.reduceToVectors({
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'water'
});

// Convert polygons to boundaries
var vectorsBoundaries = vectorsFilled.map(function(feature) {
  return feature.dissolve(30);
});

// Style filled polygons and boundaries
var vectorsFilledLayer = vectorsFilled.style({fillColor: 'FF0000', color: '00000000'});
var vectorsBoundariesLayer = vectorsBoundaries.style({color: 'FF0000', fillColor: '00000000'});

// Add vector layers to the map
Map.addLayer(vectorsFilledLayer, {}, 'Flooded Areas (Filled)');
Map.addLayer(vectorsBoundariesLayer, {}, 'Flooded Areas (Boundaries)');

// Print the number of polygons
print('Number of Flooded Area Polygons:', vectorsFilled.size());

// Export vector polygons to Google Drive
Export.table.toDrive({
  collection: vectorsFilled,
  description: 'Flooded_Areas_Vectors',
  folder: 'Your_Google_Drive_Folder_Name',
  fileFormat: 'SHP'
});

// Accuracy assessment
var truePositives = vectorsFilled.filterBounds(valid_flooded);
var falsePositives = vectorsFilled.filter(ee.Filter.bounds(valid_flooded).not());
var falseNegatives = valid_flooded.filter(ee.Filter.bounds(vectorsFilled).not());

// Calculate counts
var TPcount = truePositives.size();
var FPcount = falsePositives.size();
var FNcount = falseNegatives.size();

// Calculate Precision, Recall, and F1-score
var precision = TPcount.divide(TPcount.add(FPcount));
var recall = TPcount.divide(TPcount.add(FNcount));
var f1_score = precision.multiply(recall).multiply(2).divide(precision.add(recall));

// Print Precision, Recall, and F1-score
print('Precision:', precision);
print('Recall:', recall);
print('F1-score:', f1_score);

// Speckle filtering functions
function toNatural(img) {
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

function toDB(img) {
  return ee.Image(img).log10().multiply(10.0);
}

function RefinedLee(img) {
  // Speckle filtering using Refined Lee
  var weights3 = ee.List.repeat(ee.List.repeat(1, 3), 3);
  var kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false);
  var mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3);
  var variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3);
  var sample_weights = ee.List([[0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0]]);
  var sample_kernel = ee.Kernel.fixed(7, 7, sample_weights, 3, 3, false);
  var sample_mean = mean3.neighborhoodToBands(sample_kernel); 
  var sample_var = variance3.neighborhoodToBands(sample_kernel);
  var gradients = sample_mean.select(1).subtract(sample_mean.select(7)).abs();
  gradients = gradients.addBands(sample_mean.select(6).subtract(sample_mean.select(2)).abs());
  gradients = gradients.addBands(sample_mean.select(3).subtract(sample_mean.select(5)).abs());
  gradients = gradients.addBands(sample_mean.select(0).subtract(sample_mean.select(8)).abs());
  var max_gradient = gradients.reduce(ee.Reducer.max());
  var gradmask = gradients.eq(max_gradient);
  gradmask = gradmask.addBands(gradmask);
  var directions = sample_mean.select(1).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(7))).multiply(1);
  directions = directions.addBands(sample_mean.select(6).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(2))).multiply(2));
  directions = directions.addBands(sample_mean.select(3).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(5))).multiply(3));
  directions = directions.addBands(sample_mean.select(0).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(8))).multiply(4));
  directions = directions.addBands(directions.select(0).not().multiply(5));
  directions = directions.addBands(directions.select(1).not().multiply(6));
  directions = directions.addBands(directions.select(2).not().multiply(7));
  directions = directions.addBands(directions.select(3).not().multiply(8));
  directions = directions.updateMask(gradmask);
  directions = directions.reduce(ee.Reducer.sum());
  var sample_stats = sample_var.divide(sample_mean.multiply(sample_mean));
  var sigmaV = sample_stats.toArray().arraySort().arraySlice(0, 0, 5).arrayReduce(ee.Reducer.mean(), [0]);
  var rect_weights = ee.List.repeat(ee.List.repeat(0, 7), 3).cat(ee.List.repeat(ee.List.repeat(1, 7), 4));
  var diag_weights = ee.List([[1, 0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0], [1, 1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1]]);
  var rect_kernel = ee.Kernel.fixed(7, 7, rect_weights, 3, 3, false);
  var diag_kernel = ee.Kernel.fixed(7, 7, diag_weights, 3, 3, false);
  var dir_mean = img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel).updateMask(directions.eq(1));
  var dir_var = img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel).updateMask(directions.eq(1));
  dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel).updateMask(directions.eq(2)));
  dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel).updateMask(directions.eq(2)));
  for (var i = 1; i < 4; i++) {
    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)));
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel.rotate(i)).updateMask(directions.eq(2 * i + 1)));
    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)));
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel.rotate(i)).updateMask(directions.eq(2 * i + 2)));
  }
  dir_mean = dir_mean.reduce(ee.Reducer.sum());
  dir_var = dir_var.reduce(ee.Reducer.sum());
  var varX = dir_var.subtract(dir_mean.multiply(dir_mean).multiply(sigmaV)).divide(sigmaV.add(1.0));
  var b = varX.divide(dir_var);
  var result = dir_mean.add(b.multiply(img.subtract(dir_mean)));
  return result.arrayFlatten([['sum']]);
}
