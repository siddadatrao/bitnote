import requests
import json
import sys
import os
from packaging import version

class Updater:
    def __init__(self):
        self.GITHUB_API_URL = "https://api.github.com/repos/siddadatrao/bitnote/releases/latest"
        self.current_version = "1.0.0"  # Match this with your package.json version
        
    def check_for_updates(self):
        """Check if there's a new version available on GitHub"""
        try:
            print("\n=== Checking for Updates ===")
            headers = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'BitNote-App'
            }
            
            response = requests.get(
                self.GITHUB_API_URL,
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            
            release_data = response.json()
            latest_version = release_data['tag_name'].replace('v', '')
            
            print(f"Current version: {self.current_version}")
            print(f"Latest version: {latest_version}")
            
            if version.parse(latest_version) > version.parse(self.current_version):
                update_info = {
                    'available': True,
                    'version': latest_version,
                    'description': release_data['body'],
                    'download_url': release_data['assets'][0]['browser_download_url'] if release_data['assets'] else None,
                    'release_url': release_data['html_url']
                }
                print("Update available!")
                return update_info
            else:
                print("No updates available")
                return {
                    'available': False,
                    'current_version': self.current_version
                }
                
        except requests.exceptions.RequestException as e:
            print(f"Error checking for updates: {str(e)}")
            return {
                'available': False,
                'error': f"Connection error: {str(e)}"
            }
        except json.JSONDecodeError as e:
            print(f"Error parsing GitHub response: {str(e)}")
            return {
                'available': False,
                'error': f"Invalid response from GitHub: {str(e)}"
            }
        except Exception as e:
            print(f"Unexpected error checking for updates: {str(e)}")
            return {
                'available': False,
                'error': f"Unexpected error: {str(e)}"
            }
    
    def download_update(self, download_url, target_path):
        """Download the latest release"""
        try:
            print(f"\n=== Downloading Update from {download_url} ===")
            response = requests.get(
                download_url,
                stream=True,
                timeout=30
            )
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            block_size = 8192
            downloaded = 0
            
            with open(target_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=block_size):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        progress = (downloaded / total_size) * 100 if total_size else 0
                        print(f"Download progress: {progress:.1f}%")
            
            print("Download complete!")
            return {
                'success': True,
                'path': target_path
            }
            
        except requests.exceptions.RequestException as e:
            print(f"Error downloading update: {str(e)}")
            return {
                'success': False,
                'error': f"Download error: {str(e)}"
            }
        except Exception as e:
            print(f"Unexpected error during download: {str(e)}")
            return {
                'success': False,
                'error': f"Unexpected error: {str(e)}"
            }

def main():
    """Test the updater functionality"""
    updater = Updater()
    update_info = updater.check_for_updates()
    
    if update_info['available']:
        print("\nUpdate available!")
        print(f"Version: {update_info['version']}")
        print(f"Description: {update_info['description']}")
        
        if update_info['download_url']:
            download_path = os.path.join(os.path.expanduser('~'), 'Downloads', 'BitNote-latest.zip')
            result = updater.download_update(update_info['download_url'], download_path)
            
            if result['success']:
                print(f"\nUpdate downloaded to: {result['path']}")
            else:
                print(f"\nDownload failed: {result['error']}")
    else:
        if 'error' in update_info:
            print(f"\nError checking for updates: {update_info['error']}")
        else:
            print("\nNo updates available")

if __name__ == "__main__":
    main() 