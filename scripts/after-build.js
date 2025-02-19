const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;
  
  if (platform === 'mac') {
    const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
    console.log('Cleaning extended attributes for:', appPath);
    try {
      execSync(`xattr -cr "${appPath}"`);
      console.log('Successfully cleaned extended attributes');
    } catch (error) {
      console.error('Error cleaning extended attributes:', error);
    }
  }
}; 