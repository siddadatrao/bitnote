const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function cleanExtendedAttributes(appPath) {
  console.log(`\n=== Cleaning extended attributes for: ${appPath} ===`);
  try {
    // Clean the main app bundle
    console.log('Cleaning main app bundle...');
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
    
    // Clean all files in Frameworks directory
    const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
    if (fs.existsSync(frameworksPath)) {
      console.log('Cleaning Frameworks directory...');
      const frameworks = fs.readdirSync(frameworksPath);
      frameworks.forEach(framework => {
        const fullPath = path.join(frameworksPath, framework);
        console.log(`Cleaning framework: ${framework}`);
        execSync(`xattr -cr "${fullPath}"`, { stdio: 'inherit' });
        
        // Clean deeper for helper apps
        if (framework.includes('Helper') && framework.endsWith('.app')) {
          const helperMacOS = path.join(fullPath, 'Contents', 'MacOS');
          if (fs.existsSync(helperMacOS)) {
            console.log(`Cleaning helper app: ${framework}`);
            execSync(`xattr -cr "${helperMacOS}"`, { stdio: 'inherit' });
            const helperBinaries = fs.readdirSync(helperMacOS);
            helperBinaries.forEach(binary => {
              const binaryPath = path.join(helperMacOS, binary);
              console.log(`Cleaning helper binary: ${binary}`);
              execSync(`xattr -cr "${binaryPath}"`, { stdio: 'inherit' });
            });
          }
        }
      });
    }
    
    // Clean Resources directory
    const resourcesPath = path.join(appPath, 'Contents', 'Resources');
    if (fs.existsSync(resourcesPath)) {
      console.log('Cleaning Resources directory...');
      execSync(`xattr -cr "${resourcesPath}"`, { stdio: 'inherit' });
      
      // Specifically clean python backend
      const pythonBackend = path.join(resourcesPath, 'python', 'backend');
      if (fs.existsSync(pythonBackend)) {
        console.log('Cleaning Python backend...');
        execSync(`xattr -cr "${pythonBackend}"`, { stdio: 'inherit' });
      }
    }

    // Clean MacOS directory
    const macOSPath = path.join(appPath, 'Contents', 'MacOS');
    if (fs.existsSync(macOSPath)) {
      console.log('Cleaning MacOS directory...');
      execSync(`xattr -cr "${macOSPath}"`, { stdio: 'inherit' });
    }

    console.log('Successfully cleaned all extended attributes');
  } catch (error) {
    console.error('Error cleaning extended attributes:', error);
    throw error;
  }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  console.log('\n=== Starting notarization process ===');
  console.log('App path:', appPath);
  console.log('Certificate identity:', process.env.CSC_NAME || 'Not set');
  
  try {
    // Remove any existing .DS_Store files
    console.log('Removing .DS_Store files...');
    execSync(`find "${appPath}" -name '.DS_Store' -type f -delete`, { stdio: 'inherit' });

    // Clean extended attributes
    await cleanExtendedAttributes(appPath);

    // Verify the app bundle
    console.log('\nVerifying app bundle structure...');
    execSync(`codesign --verify --verbose --deep "${appPath}"`, { stdio: 'inherit' });

    // Sign with timestamp server
    console.log('\nSigning with timestamp server...');
    execSync(`codesign --sign "${process.env.CSC_NAME}" --force --timestamp="http://timestamp.apple.com/ts01" --options runtime --entitlements "build/entitlements.mac.plist" "${appPath}"`, { stdio: 'inherit' });

    console.log('\nAll preparation completed, proceeding with signing...');
  } catch (error) {
    console.error('\nError during notarization preparation:', error);
    throw error;
  }
}; 