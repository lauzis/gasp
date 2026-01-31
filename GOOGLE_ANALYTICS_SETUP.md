# Google Analytics API Setup Guide

This guide explains how to set up Google Analytics API access for the GASP extension.

## Prerequisites

- A Google Cloud Platform (GCP) account
- A Google Analytics 4 (GA4) property
- Admin access to both GCP and GA4

## Authentication: API Key vs Service Account

### ❌ API Keys Don't Work

Google Analytics Data API **does not support API keys**. If you try to use an API key (format: `AIzaSy...`):
- Extension will detect it and log a warning
- Returns zeros instead of real data
- Test button shows: "⚠️ API keys are not supported"

API keys work for simpler Google APIs (Maps, YouTube) but Analytics requires OAuth 2.0 authentication.

### ✅ Service Account JSON (Required)

You need a complete Service Account JSON file that looks like:
```json
{
  "type": "service_account",
  "project_id": "your-project-12345",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...",
  "client_email": "my-service-account@project.iam.gserviceaccount.com",
  ...
}
```

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable Google Analytics Data API

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google Analytics Data API"
3. Click on it and press **Enable**

### 3. Create Service Account

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **Service Account**
3. Give it a name (e.g., "GASP Extension")
4. Click **Create and Continue**
5. Skip the optional steps and click **Done**
6. Click on the created service account
7. Go to the **Keys** tab
8. Click **Add Key** > **Create new key**
9. Choose **JSON** format and click **Create**
10. Save the downloaded JSON file securely

### 4. Grant Service Account Access to GA4

1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property
3. Go to **Admin** (⚙️ gear icon)
4. Click **Property Access Management**
5. Click **+** (Add users)
6. Enter the service account email (from the JSON file, e.g., `my-service-account@project.iam.gserviceaccount.com`)
7. Grant **Viewer** role
8. Click **Add**

### 5. Get Your Property ID

1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property
3. Go to **Admin** (gear icon at bottom left)
4. Under **Property** column, click **Property Settings**
5. Copy your **Property ID** (format: numbers only, e.g., "361713900")

### 6. Configure the Extension

1. Open the downloaded JSON file in a text editor
2. Copy **ALL** the content (entire JSON, from first `{` to last `}`)
3. Open GASP extension preferences
4. Paste into "Service Account JSON" field
   - Or fill **Client Email** and **Private Key** below
5. Enter your Property ID (numbers only)
6. Click **Test** to verify the connection
7. Choose where to store credentials (GSettings or Keyring)

✅ **Green checkmark** = Success! Extension will use real Google Analytics data
❌ **Red X** = Problem - check logs with: `journalctl -f | grep gasp`

## Troubleshooting

### "Invalid JSON format"
**Cause**: Didn't paste the entire JSON content
**Solution**: Copy from first `{` to last `}`, including all content

### "Missing private_key or client_email"
**Cause**: Incomplete JSON or wrong file
**Solution**: Download a fresh JSON key from the Service Account page

### "API keys are not supported"
**Cause**: Pasted an API key instead of Service Account JSON
**Solution**: Follow steps above to create a Service Account and download JSON

### 401 Unauthorized Error
**Cause**: Invalid authentication credentials
**Solution**: 
- Verify Service Account JSON is complete and valid
- Ensure Google Analytics Data API is enabled in Cloud Console
- Download a fresh JSON key if needed

### 403 Forbidden Error
**Cause**: Valid credentials but no permission to access the property
**Solution**: 
- Verify the Property ID is correct (numbers only)
- Ensure service account has "Viewer" access to GA4 property
- Check that you granted access to the correct service account email

### Still seeing zeros or "Not configured"
**Cause**: Extension can't authenticate or fetch data
**Solution**: 
1. Check logs: `journalctl -f | grep gasp`
2. Look for specific error messages
3. Verify Service Account has access to GA4 property
4. Ensure OpenSSL is installed: `which openssl`
5. Test connection using the Test button in preferences

### No Data Returned (but authentication works)
**Cause**: Property has no data or insufficient data
**Solution**: 
- Verify your GA4 property is receiving data
- Check that you're using GA4 (not Universal Analytics)
- Wait 24-48 hours after setting up GA4 for data to appear

## Technical Details

### Authentication Method
- **OAuth 2.0 JWT**: Service Account authentication with JSON Web Tokens
- **RSA-SHA256**: Private key signing using OpenSSL
- **Token Caching**: Access tokens cached and auto-refreshed

### API Endpoint
```
POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
```

### Metrics Collected
- **activeUsers**: Number of distinct users who visited your site/app

### Date Ranges
- **Daily**: today → today
- **Weekly**: start of the calendar week (Monday) → today
- **Monthly**: start of the calendar month → today

### Dependencies
- **OpenSSL**: Required for RSA signing (usually pre-installed on Linux)
- **libsoup3**: HTTP client (provided by GNOME Shell)

### Security
- Service account credentials stored in GSettings or Keyring (based on settings)
- Temporary files for OpenSSL operations (immediately deleted)
- Minimal permissions required (only "Viewer" role needed)
- Only `client_email` and `private_key` are saved from the JSON file

## Current Limitations

1. **OpenSSL Required**: RSA signing depends on `openssl` command
2. **Manual Configuration**: Service account JSON must be pasted manually
3. **GA4 Only**: Works only with Google Analytics 4, not Universal Analytics
4. **Single Property**: Can only track one GA4 property at a time

## References

- [Google Analytics Data API Documentation](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Service Account Authentication](https://developers.google.com/identity/protocols/oauth2/service-account)
- [GA4 Dimensions & Metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
