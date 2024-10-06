var gsw = ee.Image("JRC/GSW1_2/GlobalSurfaceWater"),
    hydrosheds = ee.Image("WWF/HydroSHEDS/03VFDEM"),
    geometry = 
    /* color: #d63000 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[90.2458798153371, 24.007783376349952],
          [90.2458798153371, 23.65542003780786],
          [90.6194149715871, 23.65542003780786],
          [90.6194149715871, 24.007783376349952]]], null, false),
    valid = ee.FeatureCollection("projects/ee-almehedi06/assets/Flooded2");
    
//=====================
// Dates and Data Collection
//=====================

var floodStart = '2020-07-16';
var floodEnd = '2020-08-03';
var dryStart = '2021-01-01';
var dryEnd = '2021-02-15';

Map.addLayer(valid, {color: 'grey'}, 'Val flooded locations');

// Sentinel-1 Collection
var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
  .filter(ee.Filter.eq('resolution_meters', 10))
  .filterBounds(geometry)
  .select('VV');

var floodCollection = collection.filterDate(floodStart, floodEnd);
var dryCollection = collection.filterDate(dryStart, dryEnd);

var flood = floodCollection.mosaic().clip(geometry);
var dry = dryCollection.mosaic().clip(geometry);

Map.addLayer(flood, {min: -25, max: 0}, 'during Floods', false);
Map.addLayer(dry, {min: -25, max: 0}, 'dry Floods', false);

var floodFiltered = ee.Image(toDB(RefinedLee(toNatural(flood))));
var dryFiltered = ee.Image(toDB(RefinedLee(toNatural(dry))));

Map.addLayer(floodFiltered, {min: -25, max: 0}, 'during Filtered', false);
Map.addLayer(dryFiltered, {min: -25, max: 0}, 'dry Filtered', false);

var division = floodFiltered.divide(dryFiltered);

//=====================
// Flood Detection
//=====================

var divThreshold = 1.48;
var flooded = division.gt(divThreshold).rename('water').selfMask();
Map.addLayer(flooded, {min: 0, max: 1, palette: ['orange']}, 'Initial Flood Area', false);

// Mask out area with permanent/semi-permanent water
var permanentWater = gsw.select('seasonality').gte(5).clip(geometry);
flooded = flooded.where(permanentWater, 0).selfMask();
Map.addLayer(permanentWater.selfMask(), {min: 0, max: 1, palette: ['blue']}, 'Permanent Water');

// Mask out areas with more than 5 percent slope using the HydroSHEDS DEM
var slopeThreshold = 5;
var terrain = ee.Algorithms.Terrain(hydrosheds);
var slope = terrain.select('slope');
flooded = flooded.updateMask(slope.lt(slopeThreshold));
Map.addLayer(slope.gte(slopeThreshold).selfMask(), {min: 0, max: 1, palette: ['cyan']}, 'Steep Areas', false);

// Remove isolated pixels
var connectedPixelThreshold = 32;
var connections = flooded.connectedPixelCount(50);
flooded = flooded.updateMask(connections.gt(connectedPixelThreshold));
Map.addLayer(connections.lte(connectedPixelThreshold).selfMask(), {min: 0, max: 1, palette: ['yellow']}, 'Disconnected Areas', false);

Map.addLayer(flooded, {min: 0, max: 1, palette: ['red']}, 'Flooded Areas');

//=====================
// Area Calculation
//=====================

var stats = flooded.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  tileScale: 16
});
print('Flooded Area (Ha)', ee.Number(stats.get('water')).divide(10000));

//=====================
// Speckle Filtering Functions
//=====================

function toNatural(img) {
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

function toDB(img) {
  return ee.Image(img).log10().multiply(10.0);
}

function RefinedLee(img) {
  // img must be in natural units, i.e., not in dB
  var weights3 = ee.List.repeat(ee.List.repeat(1, 3), 3);
  var kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false);

  var mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3);
  var variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3);

  var sample_weights = ee.List([
    [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0],
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

  var gradmask = gradients.eq(max_gradient).reduce(ee.Reducer.sum());

  // Determine the 8 directions
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
  var diag_weights = ee.List([
    [1, 0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0, 0, 0], [1, 1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 1, 0],
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
  return result.arrayFlatten([['sum']]);
}

//=====================
// Accuracy Assessment
//=====================

var vectorsFilled = flooded.reduceToVectors({
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'water',
});

var vectorsBoundaries = vectorsFilled.map(function(feature) {
  return feature.dissolve(30);
});

var vectorsFilledLayer = vectorsFilled.style({fillColor: 'FF0000', color: '00000000'});
var vectorsBoundariesLayer = vectorsBoundaries.style({color: 'FF0000', fillColor: '00000000'});

Map.addLayer(vectorsFilledLayer, {}, 'Flooded Areas (Filled)');
Map.addLayer(vectorsBoundariesLayer, {}, 'Flooded Areas (Boundaries)');

print('Number of Flooded Area Polygons:', vectorsFilled.size());

var FloodPolygons = vectorsFilled;

//=====================
// Precision, Recall, and F1-score Calculation
//=====================

var truePositives = FloodPolygons.filterBounds(valid);
var falsePositives = FloodPolygons.filter(ee.Filter.bounds(valid).not());
var falseNegatives = valid.filter(ee.Filter.bounds(FloodPolygons).not());

var TPcount = truePositives.size();
var FPcount = falsePositives.size();
var FNcount = falseNegatives.size();

var precision = TPcount.divide(TPcount.add(FPcount));
print('Precision:', precision);

var recall = TPcount.divide(TPcount.add(FNcount));
print('Recall:', recall);

var f1_score = precision.multiply(recall).multiply(2).divide(precision.add(recall));
print('F1-score:', f1_score);

//=====================
// Export Results
//=====================

Export.table.toDrive({
  collection: vectorsFilled,
  description: 'Flooded_Areas_Vectors',
  folder: 'Your_Google_Drive_Folder_Name',  // Specify your Google Drive folder
  fileFormat: 'SHP'  // Export as Shapefile
});
