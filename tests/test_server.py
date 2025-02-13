import requests
import json
import time

def test_server_connection():
    """Test basic server connectivity and response"""
    API_URL = "https://bitnote-a97b19c0e48d.herokuapp.com/response_router"
    
    # Simple test prompt
    test_params = {
        "role": "You are a note taker. Create clear, structured notes.",
        "prompt": "Create a simple test note about testing servers."
    }
    
    print("\n=== Starting Server Test ===")
    
    try:
        print("Sending test request to:", API_URL)
        response = requests.get(
            API_URL,
            params=test_params,
            timeout=300,
            headers={'Connection': 'close'}
        )
        
        print(f"\nStatus Code: {response.status_code}")
        print(f"Response Headers: {json.dumps(dict(response.headers), indent=2)}")
        
        if response.status_code == 200:
            print("\nSuccess! Server is responding correctly")
            try:
                data = response.json()
                print("\nResponse Data:")
                print(json.dumps(data, indent=2)[:500] + "...")  # Print first 500 chars
            except json.JSONDecodeError:
                print("\nWarning: Response is not JSON format")
                print("Raw Response:", response.text[:500] + "...")
        else:
            print(f"\nError: Server returned status {response.status_code}")
            print("Response Text:", response.text[:500])
            
    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to server. Server might be down.")
    except requests.exceptions.Timeout:
        print("\nError: Request timed out. Server might be overloaded.")
    except Exception as e:
        print(f"\nUnexpected error: {str(e)}")
    
    print("\n=== Test Complete ===")

if __name__ == "__main__":
    # Try the test multiple times with delay
    for i in range(3):
        print(f"\nAttempt {i + 1} of 3")
        test_server_connection()
        if i < 2:  # Don't sleep after last attempt
            print("\nWaiting 5 seconds before next attempt...")
            time.sleep(5) 