function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export type TallyVendor = {
  name: string
  mailingName?: string
  address?: string
  city?: string
  state?: string
  country?: string
  pin?: string
  gstin?: string
  gstType?: string
  pan?: string
  email?: string
  phone?: string
  contact?: string
  bankName?: string
  ifsc?: string
  accountNumber?: string
  companyName?: string
}

export function buildVendorLedgerXml(vendor: TallyVendor) {
  const name = escapeXml(vendor.name)
  const company = vendor.companyName ? `<SVCURRENTCOMPANY>${escapeXml(vendor.companyName)}</SVCURRENTCOMPANY>` : ''
  const address = vendor.address ? `<ADDRESS>${escapeXml(vendor.address)}</ADDRESS>` : ''
  const state = vendor.state ? `<STATENAME>${escapeXml(vendor.state)}</STATENAME>` : ''
  const country = vendor.country ? `<COUNTRYNAME>${escapeXml(vendor.country)}</COUNTRYNAME>` : ''
  const pin = vendor.pin ? `<PINCODE>${escapeXml(vendor.pin)}</PINCODE>` : ''
  const email = vendor.email ? `<EMAIL>${escapeXml(vendor.email)}</EMAIL>` : ''
  const phone = vendor.phone ? `<LEDGERPHONE>${escapeXml(vendor.phone)}</LEDGERPHONE>` : ''
  const contact = vendor.contact ? `<LEDGERCONTACT>${escapeXml(vendor.contact)}</LEDGERCONTACT>` : ''
  const pan = vendor.pan ? `<INCOMETAXNUMBER>${escapeXml(vendor.pan)}</INCOMETAXNUMBER>` : ''
  const gstin = vendor.gstin
    ? `<LEDGSTREGDETAILS.LIST>
        <APPLICABLEFROM>20200401</APPLICABLEFROM>
        <GSTREGISTRATIONTYPE>${escapeXml(vendor.gstType || 'Regular')}</GSTREGISTRATIONTYPE>
        <PLACEOFSUPPLY>${escapeXml(vendor.state || '')}</PLACEOFSUPPLY>
        <GSTIN>${escapeXml(vendor.gstin)}</GSTIN>
      </LEDGSTREGDETAILS.LIST>`
    : ''
  const bank = vendor.bankName
    ? `<LEDGERBANKDETAILS.LIST>
        <BENEFICIARYCODE>${escapeXml(vendor.name.slice(0, 20))}</BENEFICIARYCODE>
        <BANKNAME>${escapeXml(vendor.bankName)}</BANKNAME>
        ${vendor.ifsc ? `<IFSCODE>${escapeXml(vendor.ifsc)}</IFSCODE>` : ''}
        ${vendor.accountNumber ? `<ACCOUNTNUMBER>${escapeXml(vendor.accountNumber)}</ACCOUNTNUMBER>` : ''}
      </LEDGERBANKDETAILS.LIST>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          ${company}
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${name}" ACTION="Create">
            <NAME>${name}</NAME>
            <PARENT>Sundry Creditors</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            <MAILINGNAME>${escapeXml(vendor.mailingName || vendor.name)}</MAILINGNAME>
            ${address}
            ${state}
            ${country}
            ${pin}
            ${email}
            ${phone}
            ${contact}
            ${pan}
            ${gstin}
            ${bank}
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

export function buildCompanyPingXml(companyName?: string) {
  const company = companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        ${company}
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`
}
