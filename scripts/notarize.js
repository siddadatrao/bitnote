require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log('\n=== Starting code signing process ===');
  console.log('App path:', appPath);
  console.log('Certificate identity:', process.env.CSC_NAME);

  try {
    // Sign the .app bundle
    console.log('\nSigning .app bundle...');
    execSync(
      `codesign --sign "${process.env.CSC_NAME}" --force --timestamp --options runtime --entitlements "build/entitlements.mac.plist" "${appPath}"`,
      { stdio: 'inherit' }
    );
    
    console.log('\nVerifying .app signature...');
    execSync(`codesign --verify --verbose --deep "${appPath}"`, { stdio: 'inherit' });
    
    console.log('\nCode signing completed successfully');
  } catch (error) {
    console.error('\nError during code signing:', error);
    throw error;
  }
}; 