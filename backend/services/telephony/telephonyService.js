const ExotelProvider = require('./exotelProvider');

class TelephonyService {
  constructor() {
    this.provider = new ExotelProvider();
  }

  setProvider(providerInstance) {
    this.provider = providerInstance;
    console.log(`[TelephonyService] Provider set to: ${this.provider.name}`);
  }

  /**
   * Initiate call (Duty reminder or Test call)
   */
  async callEmployee({ phoneNumber, employeeName, dutyTime, customMessage, webhookUrl, isTestCall = false }) {
    if (!phoneNumber) {
      throw new Error('Phone number is required to make a telephony call.');
    }

    let message = customMessage;
    if (!message) {
      if (isTestCall) {
        message = this.provider.buildTestVoiceMessage();
      } else {
        message = this.provider.buildDutyVoiceMessage(employeeName || 'Employee', dutyTime || '10:00 AM');
      }
    }

    return await this.provider.makeCall({
      phoneNumber,
      message,
      webhookUrl,
      isTestCall
    });
  }

  getProviderName() {
    return this.provider.name;
  }

  isConfigured() {
    return this.provider.isConfigured();
  }
}

module.exports = new TelephonyService();
