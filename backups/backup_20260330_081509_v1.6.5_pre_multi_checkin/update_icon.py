import os

def update():
    try:
        # Read base64 - Handling UTF-16LE which redirect might have used
        with open('logo_base64.txt', 'rb') as f:
            raw = f.read()
            # Try to decode as utf-16 if it looks like it (BOM)
            if raw.startswith(b'\xff\xfe') or raw.startswith(b'\xfe\xff'):
                b64_data = raw.decode('utf-16').strip()
            else:
                b64_data = raw.decode('utf-8').replace('\x00', '').strip()
        
        # Read HTML
        with open('icon_gen.html', 'r', encoding='utf-8') as f:
            html = f.read()
        
        # Replace URL with base64 data URI
        old_url = '"https://www.essencio.com.br/wp-content/uploads/2024/05/Essencio_principal-2024-1-1024x225.png"'
        new_url = f'"data:image/png;base64,{b64_data}"'
        
        if old_url in html:
            new_html = html.replace(old_url, new_url)
            with open('icon_gen.html', 'w', encoding='utf-8') as f:
                f.write(new_html)
            print("Successfully updated icon_gen.html")
        else:
            print("Search string not found in icon_gen.html")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    update()
