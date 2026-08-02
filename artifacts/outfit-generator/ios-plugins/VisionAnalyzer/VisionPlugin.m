#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Register the VisionPlugin Swift class as the "VisionAnalyzer" Capacitor plugin.
CAP_PLUGIN(VisionPlugin, "VisionAnalyzer",
    CAP_PLUGIN_METHOD(analyze, CAPPluginReturnPromise);
)
