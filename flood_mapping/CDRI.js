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
        [[[34.760464992014356, -19.59878701610058],
          [34.760464992014356, -19.852157349456057],
          [35.00834402033467, -19.852157349456057],
          [35.00834402033467, -19.59878701610058]]], null, false),
    valid_nonflooded = ee.FeatureCollection("projects/ee-almehedi06/assets/P3_Beira_valid_noflood"),
    valid_flooded = ee.FeatureCollection("projects/ee-almehedi06/assets/P3_Beira_valid_flooded"),
    beira_valid_georef = ee.Image("projects/ee-almehedi06/assets/Beira_valid_georef");

//Dates
var floodStart = '2019-03-10'
var floodEnd = '2019-03-20'
var dryStart = '2018-11-01'
var dryEnd = '2019-02-25' 

// Sentinel-1 Collection
var collection= ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode','IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING')) 
  .filter(ee.Filter.eq('resolution_meters',10))
  .filterBounds(geometry)
  .select('VV'); 

var floodCollection = collection.filterDate(floodStart, floodEnd)
var dryCollection = collection.filterDate(dryStart,dryEnd)

var flood = floodCollection.mosaic().clip(geometry);
var dry = dryCollection.mosaic().clip(geometry);

Map.addLayer(flood, {min:-25,max:0}, 'flood Floods', false);
Map.addLayer(dry, {min:-25,max:0}, 'dry Floods', false); 

var floodFiltered = ee.Image(toDB(RefinedLee(toNatural(flood))))
var dryFiltered = ee.Image(toDB(RefinedLee(toNatural(dry))))

Map.addLayer(floodFiltered, {min:-25,max:0}, 'flood Filtered', false);
Map.addLayer(dryFiltered, {min:-25,max:0}, 'dry Filtered', false); 

// var division = floodSquared.divide(drySquared);
var division = floodFiltered.divide(dryFiltered);
//////////////////////////////////////////
/////////////////////////////////////////

// Define a threshold
var divThreshold = 1.6;
// Initial estimate of flooded pixels
var flooded = division.gt(divThreshold).rename('water').selfMask();
Map.addLayer(flooded, {min:0, max:1, palette: ['orange']}, 'Initial Flood Area', false);

// Mask out area with permanent/semi-permanent water
var permanentWater = gsw.select('seasonality').gte(5).clip(geometry)
var flooded = flooded.where(permanentWater, 0).selfMask()
Map.addLayer(permanentWater.selfMask(), {min:0, max:1, palette: ['blue']}, 'Permanent Water')

// Mask out areas with more than 5 percent slope using the HydroSHEDS DEM
var slopeThreshold = 5;
var terrain = ee.Algorithms.Terrain(hydrosheds);
var slope = terrain.select('slope');
var flooded = flooded.updateMask(slope.lt(slopeThreshold));
Map.addLayer(slope.gte(slopeThreshold).selfMask(), {min:0, max:1, palette: ['cyan']}, 'Steep Areas', false)

// // Remove isolated pixels
// // connectedPixelCount is Zoom dependent, so visual result will vary
// var connectedPixelThreshold = 8;
// var connections = flooded.connectedPixelCount(8)
// var flooded = flooded.updateMask(connections.gt(connectedPixelThreshold))
// Map.addLayer(connections.lte(connectedPixelThreshold).selfMask(), {min:0, max:1, palette: ['yellow']}, 'Disconnected Areas', false)

// Calculate the number of connected pixels within a 1-pixel radius for each pixel
var connectedPixelCount = flooded.connectedPixelCount({
  maxSize: 128,
  eightConnected: true
});

// Mask out the isolated pixels (where the connected pixel count is 1)
var flooded = flooded.updateMask(connectedPixelCount.gt(1));

Map.addLayer(flooded, {min:0, max:1, palette: ['red']}, 'Flooded Areas');

// Calculate Affected Area
//print('Total District Area (Ha)', geometry.area().divide(10000))

var stats = flooded.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  tileScale: 16
})
print('Flooded Area (Ha)', ee.Number(stats.get('water')).divide(10000))


Map.addLayer(beira_valid_georef, {}, 'Valid Flooded Areas');


//############################
// Speckle Filtering Functions
//############################

// Function to convert from dB
function toNatural(img) {
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

//Function to convert to dB
function toDB(img) {
  return ee.Image(img).log10().multiply(10.0);
}

//Apllying a Refined Lee Speckle filter as coded in the SNAP 3.0 S1TBX:

//https://github.com/senbox-org/s1tbx/blob/master/s1tbx-op-sar-processing/src/main/java/org/esa/s1tbx/sar/gpf/filtering/SpeckleFilters/RefinedLee.java
//Adapted by Guido Lemoine

// by Guido Lemoine
function RefinedLee(img) {
  // img must be in natural units, i.e. not in dB!
  // Set up 3x3 kernels 
  var weights3 = ee.List.repeat(ee.List.repeat(1,3),3);
  var kernel3 = ee.Kernel.fixed(3,3, weights3, 1, 1, false);

  var mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3);
  var variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3);

  // Use a sample of the 3x3 windows inside a 7x7 windows to determine gradients and directions
  var sample_weights = ee.List([[0,0,0,0,0,0,0], [0,1,0,1,0,1,0],[0,0,0,0,0,0,0], [0,1,0,1,0,1,0], [0,0,0,0,0,0,0], [0,1,0,1,0,1,0],[0,0,0,0,0,0,0]]);

  var sample_kernel = ee.Kernel.fixed(7,7, sample_weights, 3,3, false);

  // Calculate mean and variance for the sampled windows and store as 9 bands
  var sample_mean = mean3.neighborhoodToBands(sample_kernel); 
  var sample_var = variance3.neighborhoodToBands(sample_kernel);

  // Determine the 4 gradients for the sampled windows
  var gradients = sample_mean.select(1).subtract(sample_mean.select(7)).abs();
  gradients = gradients.addBands(sample_mean.select(6).subtract(sample_mean.select(2)).abs());
  gradients = gradients.addBands(sample_mean.select(3).subtract(sample_mean.select(5)).abs());
  gradients = gradients.addBands(sample_mean.select(0).subtract(sample_mean.select(8)).abs());

  // And find the maximum gradient amongst gradient bands
  var max_gradient = gradients.reduce(ee.Reducer.max());

  // Create a mask for band pixels that are the maximum gradient
  var gradmask = gradients.eq(max_gradient);

  // duplicate gradmask bands: each gradient represents 2 directions
  gradmask = gradmask.addBands(gradmask);

  // Determine the 8 directions
  var directions = sample_mean.select(1).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(7))).multiply(1);
  directions = directions.addBands(sample_mean.select(6).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(2))).multiply(2));
  directions = directions.addBands(sample_mean.select(3).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(5))).multiply(3));
  directions = directions.addBands(sample_mean.select(0).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(8))).multiply(4));
  // The next 4 are the not() of the previous 4
  directions = directions.addBands(directions.select(0).not().multiply(5));
  directions = directions.addBands(directions.select(1).not().multiply(6));
  directions = directions.addBands(directions.select(2).not().multiply(7));
  directions = directions.addBands(directions.select(3).not().multiply(8));

  // Mask all values that are not 1-8
  directions = directions.updateMask(gradmask);

  // "collapse" the stack into a singe band image (due to masking, each pixel has just one value (1-8) in it's directional band, and is otherwise masked)
  directions = directions.reduce(ee.Reducer.sum());  

  //var pal = ['ffffff','ff0000','ffff00', '00ff00', '00ffff', '0000ff', 'ff00ff', '000000'];
  //Map.addLayer(directions.reduce(ee.Reducer.sum()), {min:1, max:8, palette: pal}, 'Directions', false);

  var sample_stats = sample_var.divide(sample_mean.multiply(sample_mean));

  // Calculate localNoiseVariance
  var sigmaV = sample_stats.toArray().arraySort().arraySlice(0,0,5).arrayReduce(ee.Reducer.mean(), [0]);

  // Set up the 7*7 kernels for directional statistics
  var rect_weights = ee.List.repeat(ee.List.repeat(0,7),3).cat(ee.List.repeat(ee.List.repeat(1,7),4));

  var diag_weights = ee.List([[1,0,0,0,0,0,0], [1,1,0,0,0,0,0], [1,1,1,0,0,0,0], 
    [1,1,1,1,0,0,0], [1,1,1,1,1,0,0], [1,1,1,1,1,1,0], [1,1,1,1,1,1,1]]);

  var rect_kernel = ee.Kernel.fixed(7,7, rect_weights, 3, 3, false);
  var diag_kernel = ee.Kernel.fixed(7,7, diag_weights, 3, 3, false);

  // Create stacks for mean and variance using the original kernels. Mask with relevant direction.
  var dir_mean = img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel).updateMask(directions.eq(1));
  var dir_var = img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel).updateMask(directions.eq(1));

  dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel).updateMask(directions.eq(2)));
  dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel).updateMask(directions.eq(2)));

  // and add the bands for rotated kernels
  for (var i=1; i<4; i++) {
    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel.rotate(i)).updateMask(directions.eq(2*i+1)));
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel.rotate(i)).updateMask(directions.eq(2*i+1)));
    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel.rotate(i)).updateMask(directions.eq(2*i+2)));
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel.rotate(i)).updateMask(directions.eq(2*i+2)));
  }

  // "collapse" the stack into a single band image (due to masking, each pixel has just one value in it's directional band, and is otherwise masked)
  dir_mean = dir_mean.reduce(ee.Reducer.sum());
  dir_var = dir_var.reduce(ee.Reducer.sum());

  // A finally generate the filtered value
  var varX = dir_var.subtract(dir_mean.multiply(dir_mean).multiply(sigmaV)).divide(sigmaV.add(1.0));

  var b = varX.divide(dir_var);

  var result = dir_mean.add(b.multiply(img.subtract(dir_mean)));
  return(result.arrayFlatten([['sum']]));
  

////////////////////////////////
////////////////////////////////
var floodInfo = flood.getInfo();
print("Detailed Band Information for 'flood' Image:", floodInfo);

// Compute the histogram
var histogram = ui.Chart.image.histogram({
  image: floodFiltered,
  region: geometry,
  scale: 10,  // Adjust the scale based on your data
  maxBuckets: 1000  // Adjust the number of buckets as needed
});

// Display the histogram
print(histogram);

////////////////////
/////////////////////
// Convert binary raster to vector polygons with fill
var vectorsFilled = flooded.reduceToVectors({
  geometry: geometry,
  scale: 30,
  maxPixels: 1e10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'water',
});

// Convert binary raster to vector polygons for boundaries only
var vectorsBoundaries = vectorsFilled.map(function(feature) {
  return feature.dissolve(30); // Adjust the buffer size as needed
});

// Style filled polygons with red color
var vectorsFilledLayer = vectorsFilled.style({ fillColor: 'FF0000', color: '00000000' });

// Style boundaries with red color
var vectorsBoundariesLayer = vectorsBoundaries.style({ color: 'FF0000', fillColor: '00000000' });

// Add layers to the map
Map.addLayer(vectorsFilledLayer, {}, 'Flooded Areas (Filled)');
Map.addLayer(vectorsBoundariesLayer, {}, 'Flooded Areas (Boundaries)');

// Print the feature count
print('Number of Flooded Area Polygons:', vectorsFilled.size());


////////////////////////////// 
// Export vector polygons to Google Drive
Export.table.toDrive({
  collection: vectorsFilled,
  description: 'Flooded_Areas_Vectors',
  folder: 'Your_Google_Drive_Folder_Name', // Specify your Google Drive folder
  fileFormat: 'SHP' // Export as Shapefile
});  



///////////////////////////////////////
// //////Accuracy Assessment
///////////////////////////////////////

// Assuming vectorsFilled and valid_flooded are ee.FeatureCollections representing 
// predicted and actual flooded areas respectively.

// True Positives (TP): Areas that were correctly identified as flooded
// Intersection between vectorsFilled and valid_flooded
var truePositives = vectorsFilled.filterBounds(valid_flooded);

// False Positives (FP): Areas that were incorrectly identified as flooded
// Features in vectorsFilled that do not intersect with valid_flooded
var falsePositives = vectorsFilled.filter(ee.Filter.bounds(valid_flooded).not());

// False Negatives (FN): Actual flood areas that were not identified by the model
// Features in valid_flooded that do not intersect with vectorsFilled
var falseNegatives = valid_flooded.filter(ee.Filter.bounds(vectorsFilled).not());

// Counting the number of features in each category
var TPcount = truePositives.size();
var FPcount = falsePositives.size();
var FNcount = falseNegatives.size();

// Print the counts to the console
// print('True Positives:', TPcount);
// print('False Positives:', FPcount);
// print('False Negatives:', FNcount);

// Calculate Precision
// Precision = TP / (TP + FP)
var precision = TPcount.divide(TPcount.add(FPcount));

// Print Precision to the console
print('Precision:', precision);


// Calculate Recall
// Recall = TP / (TP + FN)
var recall = TPcount.divide(TPcount.add(FNcount));

// Print Recall to the console
print('Recall:', recall);

// Calculate F1-score
// F1-score = 2 * (Precision * Recall) / (Precision + Recall)
var f1_score = precision.multiply(recall).multiply(2).divide(precision.add(recall));

// Print F1-score to the console
print('F1-score:', f1_score);


// // Calculate the total number of cases
// var totalCases = TPcount.add(FPcount).add(FNcount).add(TNcount);

// // Calculate observed agreement (Po)
// var Po = TPcount.add(TNcount).divide(totalCases);

// // Calculate expected agreement (Pe)
// // This requires the marginal totals of the confusion matrix
// var totalActualPositives = TPcount.add(FNcount);
// var totalPredictedPositives = TPcount.add(FPcount);
// var totalActualNegatives = TNcount.add(FPcount);
// var totalPredictedNegatives = TNcount.add(FNcount);

// var Pe = totalActualPositives.multiply(totalPredictedPositives)
//         .add(totalActualNegatives.multiply(totalPredictedNegatives))
//         .divide(totalCases.square());

// // Calculate Kappa Coefficient
// var kappa = Po.subtract(Pe).divide(ee.Number(1).subtract(Pe));

// // Print Kappa Coefficient to the console
// print('Kappa Coefficient:', kappa);
