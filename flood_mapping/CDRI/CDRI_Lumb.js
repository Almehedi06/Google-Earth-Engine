var gsw = ee.Image("JRC/GSW1_2/GlobalSurfaceWater"),
    hydrosheds = ee.Image("WWF/HydroSHEDS/03VFDEM"),
    dataset = ee.ImageCollection("USGS/NLCD_RELEASES/2016_REL"),
    geometry = 
    /* color: #d63000 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[-79.0350848010005, 34.6314232718352],
          [-79.0350848010005, 34.61041008432643],
          [-79.00427158383741, 34.61041008432643],
          [-79.00427158383741, 34.6314232718352]]], null, false),
    valid_flooded = ee.FeatureCollection("projects/ee-almehedi06/assets/P3_Lumb_valid_flood");
    
  

//Dates
var floodStart = '2016-10-07';
var floodEnd = '2016-10-12';
var dryStart = '2017-01-01';
var dryEnd = '2017-03-25';

print(valid_flooded);

// Sentinel-1 Collection
var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode','IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING')) 
  .filter(ee.Filter.eq('resolution_meters', 10))
  .filterBounds(geometry)
  .select('VV');

var floodCollection = collection.filterDate(floodStart, floodEnd);
var dryCollection = collection.filterDate(dryStart, dryEnd);

var flood = floodCollection.mosaic().clip(geometry);
var dry = dryCollection.mosaic().clip(geometry);

Map.addLayer(flood, {min: -25, max: 0}, 'Flooded Image', false);
Map.addLayer(dry, {min: -25, max: 0}, 'Dry Image', false);

// Apply speckle filtering using Refined Lee
var floodFiltered = ee.Image(toDB(RefinedLee(toNatural(flood))));
var dryFiltered = ee.Image(toDB(RefinedLee(toNatural(dry))));

Map.addLayer(floodFiltered, {min: -25, max: 0}, 'Flood Filtered', false);
Map.addLayer(dryFiltered, {min: -25, max: 0}, 'Dry Filtered', false);

// Ratio-based flood detection
var division = floodFiltered.divide(dryFiltered);

// Define flood detection threshold
var divThreshold = 1.1;
var flooded = division.gt(divThreshold).rename('water').selfMask();
Map.addLayer(flooded, {min: 0, max: 1, palette: ['orange']}, 'Initial Flood Area', false);

// Mask out permanent/semi-permanent water areas using seasonality from Global Surface Water dataset
var permanentWater = gsw.select('seasonality').gte(5).clip(geometry);
var flooded = flooded.where(permanentWater, 0).selfMask();
Map.addLayer(permanentWater.selfMask(), {min: 0, max: 1, palette: ['blue']}, 'Permanent Water');

// Mask out steep slope areas using HydroSHEDS DEM
var slopeThreshold = 5;
var terrain = ee.Algorithms.Terrain(hydrosheds);
var slope = terrain.select('slope');
var flooded = flooded.updateMask(slope.lt(slopeThreshold));
Map.addLayer(slope.gte(slopeThreshold).selfMask(), {min: 0, max: 1, palette: ['cyan']}, 'Steep Areas', false);

// Remove isolated pixels based on connected pixel count
var connectedPixelCount = flooded.connectedPixelCount({
  maxSize: 128,
  eightConnected: true
});
var flooded = flooded.updateMask(connectedPixelCount.gt(1));
Map.addLayer(flooded, {min: 0, max: 1, palette: ['red']}, 'Final Flooded Areas');

// Calculate affected area
var stats = flooded.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  tileScale: 16
});
print('Flooded Area (Ha)', ee.Number(stats.get('water')).divide(10000));

// Add ground truth or validation dataset
Map.addLayer(valid_flooded, {}, 'Valid Flooded Areas');

// Speckle Filtering Functions
function toNatural(img) {
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

function toDB(img) {
  return ee.Image(img).log10().multiply(10.0);
}

// Refined Lee Speckle Filter
function RefinedLee(img) {
  var weights3 = ee.List.repeat(ee.List.repeat(1, 3), 3);
  var kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false);
  var mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3);
  var variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3);
  var sample_weights = ee.List([
    [0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0]
  ]);
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
  var directions = sample_mean.select(1).subtract(sample_mean.select(4))
    .gt(sample_mean.select(4).subtract(sample_mean.select(7))).multiply(1);
  directions = directions.addBands(sample_mean.select(6)
    .subtract(sample_mean.select(4)).gt(sample_mean.select(4)
    .subtract(sample_mean.select(2))).multiply(2));
  directions = directions.addBands(sample_mean.select(3)
    .subtract(sample_mean.select(4)).gt(sample_mean.select(4)
    .subtract(sample_mean.select(5))).multiply(3));
  directions = directions.addBands(sample_mean.select(0)
    .subtract(sample_mean.select(4)).gt(sample_mean.select(4)
    .subtract(sample_mean.select(8))).multiply(4));
  directions = directions.addBands(directions.select(0).not().multiply(5));
  directions = directions.addBands(directions.select(1).not().multiply(6));
  directions = directions.addBands(directions.select(2).not().multiply(7));
  directions = directions.addBands(directions.select(3).not().multiply(8));
  directions = directions.updateMask(gradmask);
  directions = directions.reduce(ee.Reducer.sum());
  var sample_stats = sample_var.divide(sample_mean.multiply(sample_mean));
  var sigmaV = sample_stats.toArray().arraySort().arraySlice(0, 0, 5).arrayReduce(ee.Reducer.mean(), [0]);
  var rect_weights = ee.List.repeat(ee.List.repeat(0, 7), 3).cat(ee.List.repeat(ee.List.repeat(1, 7), 4));
  var diag_weights = ee.List([
    [1, 0, 0, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1]
  ]);
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
  return(result.arrayFlatten([['sum']]));
}

// Export final flooded areas as vector polygons
var vectorsFilled = flooded.reduceToVectors({
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'water',
});

// Style and add vector polygons to map
var vectorsFilledLayer = vectorsFilled.style({ fillColor: 'FF0000', color: '00000000' });
Map.addLayer(vectorsFilledLayer, {}, 'Flooded Areas (Filled)');

// Export vector polygons
Export.table.toDrive({
  collection: vectorsFilled,
  description: 'Flooded_Areas_Vectors',
  folder: 'Your_Google_Drive_Folder_Name', // Specify your Google Drive folder
  fileFormat: 'SHP' // Export as Shapefile
});

// Accuracy Assessment
var truePositives = vectorsFilled.filterBounds(valid_flooded);
var falsePositives = vectorsFilled.filter(ee.Filter.bounds(valid_flooded).not());
var falseNegatives = valid_flooded.filter(ee.Filter.bounds(vectorsFilled).not());

var TPcount = truePositives.size();
var FPcount = falsePositives.size();
var FNcount = falseNegatives.size();

var precision = TPcount.divide(TPcount.add(FPcount));
print('Precision:', precision);

var recall = TPcount.divide(TPcount.add(FNcount));
print('Recall:', recall);

var f1_score = precision.multiply(recall).multiply(2).divide(precision.add(recall));
print('F1-score:', f1_score);
