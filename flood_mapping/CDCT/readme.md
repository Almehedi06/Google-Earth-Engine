# Flood Mapping using Normalized Flood Index and Machine Learning

This directory contains scripts and resources for **flood mapping** using the **Normalized Flood Index (NFI)**, satellite data processed in **Google Earth Engine (GEE)**, and a **Random Forest** machine learning model. The primary goal is to detect and map flood-affected regions and refine predictions using a trained machine learning model.

## Objectives

1. **Flood Detection**: Apply the **Normalized Flood Index (NFI)** using Sentinel and Landsat data to identify flooded areas.
2. **Random Forest Model**: Use a **Random Forest** machine learning model to enhance flood prediction accuracy.
3. **Flood Mapping**: Visualize flood-affected areas on maps and quantify their impact.

---

## Contents

- **`flood_mapping_analysis.js`**: Core script that uses the **Normalized Flood Index (NFI)** to detect flooded areas.
- **`data_preprocessing.js`**: Preprocesses satellite data, including the calculation of NFI and feature extraction for machine learning.
- **`train_random_forest_model.js`**: Trains a **Random Forest** model to improve flood detection using preprocessed satellite data.
- **`evaluate_model.js`**: Evaluates the performance of the trained Random Forest model using accuracy metrics and generates predictions.
- **`output/`**: Directory containing the results, including the NFI-based flood maps and Random Forest model predictions.
- **`models/`**: Directory to store the trained Random Forest models for flood detection.

---

## Data Sources

The flood mapping and model training use the following satellite data sources:

1. **Sentinel-1 SAR**: Provides radar images useful for flood detection under all weather conditions.
2. **Sentinel-2 Multispectral Data**: Used for calculating the **Normalized Flood Index (NFI)** and further analysis.
3. **Landsat-8**: Provides historical multispectral data for long-term flood analysis.

Data is accessed through the **Google Earth Engine (GEE)** data catalog.

---

## How to Run the Scripts

### 1. **Open Google Earth Engine Code Editor**:
   - Ensure you have access to the [Google Earth Engine Code Editor](https://code.earthengine.google.com/).

### 2. **Data Preprocessing**:
   - Run the `data_preprocessing.js` script to compute the **Normalized Flood Index (NFI)** using Sentinel-2 and Landsat-8 data. This step also prepares the data for machine learning.

### 3. **Flood Detection**:
   - Open the `flood_mapping_analysis.js` file in GEE and run the script to generate flood maps based on the **NFI**.
   - Modify the **Area of Interest (AOI)** and **date range** in the script to match your region and time period of interest.

### 4. **Train the Random Forest Model**:
   - Load and run the `train_random_forest_model.js` script to train a **Random Forest** model using the preprocessed satellite data and NFI features.
   - The trained model will be saved in the `models/` directory for future use.

### 5. **Model Evaluation**:
   - Run the `evaluate_model.js` script to evaluate the accuracy of the Random Forest model on the test data. This script will output performance metrics such as accuracy, precision, recall, and confusion matrices.

---

## Output

- **Flood Maps**: Generated flood maps based on the **Normalized Flood Index (NFI)**, output as GeoTIFFs or visualized directly in the GEE console.
- **Random Forest Predictions**: Model predictions for flood detection, exported as classification maps or evaluation reports.
- **Model Accuracy**: Metrics and performance graphs, such as confusion matrices, accuracy scores, and feature importance for the Random Forest model.

---

## Customization

You can customize the flood mapping and machine learning model by modifying the following parameters:

1. **Area of Interest (AOI)**: Define your geographical region by modifying the geometry in the `flood_mapping_analysis.js` and `data_preprocessing.js` scripts.
2. **Time Period**: Adjust the date range to target specific flood events.
3. **Random Forest Parameters**: In `train_random_forest_model.js`, you can adjust hyperparameters such as the number of trees, maximum depth, or feature selection to improve model performance.
4. **Thresholds for Flood Detection**: Modify thresholds for the **Normalized Flood Index (NFI)** in `flood_mapping_analysis.js` to refine the sensitivity of flood detection.

---

## Dependencies

The scripts are designed to run in **Google Earth Engine** directly and do not require additional dependencies. However, if you plan to use machine learning features outside of GEE, you may need Python libraries like `scikit-learn` and `pandas`.

---

## Next Steps

1. **Further Model Tuning**: Adjust the Random Forest model's hyperparameters and improve feature engineering for better flood detection results.
2. **Export and Analyze**: Export flood maps and classification outputs to external platforms like **QGIS** or **ArcGIS** for further spatial analysis.
3. **Extend to Other Regions**: Apply the flood mapping and model to other regions or flood events by adjusting the Area of Interest (AOI) and date range.

---

## License

This project is licensed under the MIT License - see the [LICENSE.md](../LICENSE.md) file for details.

