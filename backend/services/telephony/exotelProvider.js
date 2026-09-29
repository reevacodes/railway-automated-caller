const axios = require('axios');

class ExotelProvider {
  constructor() {
    this.name = 'Exotel';
    this.apiKey = process.env.EXOTEL_API_KEY || '';
    this.apiToken = process.env.EXOTEL_API_TOKEN || '';
    this.accountSid = process.env.EXOTEL_ACCOUNT_SID || '';
    this.virtualNumber = process.env.EXOTEL_PHONE_NUMBER || '';
    this.subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
    this.flowId = process.env.EXOTEL_FLOW_ID || process.env.EXOTEL_APP_ID || '';
    this.customUrl = process.env.EXOTEL_PASSTHRU_URL || process.env.EXOTEL_URL || '';
  }

  isConfigured() {
    const isPlaceholder = (str) => !str || str.startsWith('your_') || str.includes('your_exotel') || str.trim() === '';
    return Boolean(
      !isPlaceholder(this.apiKey) &&
      !isPlaceholder(this.apiToken) &&
      !isPlaceholder(this.accountSid) &&
      !isPlaceholder(this.virtualNumber)
    );
  }

  buildDutyVoiceMessage(employeeName, dutyTime) {
    return `Hello ${employeeName}. This is an automated Railway duty reminder. Your duty is scheduled today at ${dutyTime}. Please press 1 to confirm your duty reporting, or press 2 to request control room assistance. Thank you.`;
  }

  buildTestVoiceMessage() {
    return `Hello. This is a test call from the Railway Duty Reminder System. Please press 1 to confirm duty reporting, or press 2 for control room assistance. Thank you.`;
  }

  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return { valid: false, message: 'Phone number is missing or invalid.' };
    }

    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    const is10Digit = /^[6-9]\d{9}$/.test(cleaned);
    const isE164 = /^\+91[6-9]\d{9}$/.test(cleaned);
    const is91Prefix = /^91[6-9]\d{9}$/.test(cleaned);
    const is0Prefix = /^0[6-9]\d{9}$/.test(cleaned);

    if (!is10Digit && !isE164 && !is91Prefix && !is0Prefix) {
      return {
        valid: false,
        message: 'Invalid phone number format. Please provide a valid 10-digit Indian mobile number (e.g. +918899401450 or 08899401450).'
      };
    }

    let e164Number = cleaned;
    if (is10Digit) e164Number = `+91${cleaned}`;
    else if (is91Prefix) e164Number = `+${cleaned}`;

    return { valid: true, e164Number, rawCleaned: cleaned };
  }

  async makeCall({ phoneNumber, message, webhookUrl, isTestCall = false }) {
    const phoneCheck = this.validatePhoneNumber(phoneNumber);
    if (!phoneCheck.valid) {
      throw new Error(phoneCheck.message);
    }

    const targetPhone = phoneCheck.e164Number;

    if (!this.isConfigured()) {
      throw new Error('Exotel credentials missing or unconfigured. Please check EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, and EXOTEL_PHONE_NUMBER in .env.');
    }

    const spokenMessage = message || (isTestCall ? this.buildTestVoiceMessage() : this.buildDutyVoiceMessage('Employee', '10:00 AM'));

    const maskedPhone = targetPhone.length > 5 
      ? `${targetPhone.slice(0, 4)}****${targetPhone.slice(-3)}` 
      : '****';
    
    console.log(`[Telephony:Exotel] Preparing outbound call to ${maskedPhone}...`);

    try {
      const authHeader = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString('base64');
      const url = `https://${this.subdomain}/v1/Accounts/${this.accountSid}/Calls/connect.json`;

      const params = new URLSearchParams();

      // Determine Flow URL vs Direct Call
      let flowUrl = this.customUrl;
      if (!flowUrl && this.flowId) {
        flowUrl = `http://my.exotel.com/${this.accountSid}/exoml/start_voice/${this.flowId}`;
      }

      if (flowUrl) {
        // Applet / Flow Mode
        console.log(`[Telephony:Exotel] Mode: Exotel Cloud Flow (${flowUrl})`);
        params.append('From', targetPhone);
        params.append('CallerId', this.virtualNumber);
        params.append('Url', flowUrl);
        
        // Exotel Applets (start_voice) often crash or reject calls if CustomField is passed.
        // We only append it if we are using our custom dynamic webhook URL.
        if (!flowUrl.includes('start_voice')) {
          params.append('CustomField', spokenMessage);
        }
      } else {
        // Direct Call Mode (Exotel Verified Connect Payload)
        console.log(`[Telephony:Exotel] Mode: Direct Call (From: ${maskedPhone}, To: ${maskedPhone})`);
        params.append('From', targetPhone);
        params.append('To', targetPhone);
        params.append('CallerId', this.virtualNumber);
        params.append('CustomField', spokenMessage);
      }

      params.append('CallType', 'trans');

      if (webhookUrl && !webhookUrl.includes('localhost') && !webhookUrl.includes('127.0.0.1')) {
        params.append('StatusCallback', webhookUrl);
      }

      console.log(`[Telephony:Exotel] Sending HTTP POST to Exotel API...`);

      const response = await axios.post(url, params, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 12000
      });

      const callData = response.data?.Call || {};
      const providerCallId = callData.Sid || `exotel_${Date.now()}`;
      const status = (callData.Status || 'initiated').toLowerCase();

      console.log(`[Telephony:Exotel] Exotel API Accepted Request. Call SID: ${providerCallId}, Status: ${status}`);

      return {
        success: true,
        provider: 'Exotel',
        providerCallId,
        status,
        message: 'Test call initiated successfully via Exotel',
        rawResponse: response.data
      };
    } catch (error) {
      let errorMessage = 'Network error contacting Exotel API.';

      if (error.response) {
        const exotelErr = error.response.data?.RestException;
        if (exotelErr) {
          const code = exotelErr.Status || error.response.status;
          const exotelMsg = exotelErr.Message || '';

          if (code === 403 && exotelMsg.toLowerCase().includes('kyc')) {
            errorMessage = `Exotel Account Verification Pending (Code 403): Your Exotel account is awaiting TRAI KYC document approval in the Exotel dashboard.`;
          } else {
            errorMessage = `Exotel API Rejected Request [Code ${code}]: ${exotelMsg}`;
          }
        } else {
          errorMessage = `Exotel API HTTP Error ${error.response.status}: ${error.response.statusText}`;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Connection to Exotel API timed out after 12 seconds.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      console.error(`[Telephony:Exotel] Exotel Response:`, errorMessage);
      throw new Error(errorMessage);
    }
  }
}

module.exports = ExotelProvider;
