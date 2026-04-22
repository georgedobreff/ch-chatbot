const BASE_URL = 'https://api.company-information.service.gov.uk';

// Helper to construct the authorization header using the API key.
function getAuthHeaders() {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
        throw new Error('COMPANIES_HOUSE_API_KEY environment variable is not defined.');
    }
    const encodedKey = Buffer.from(`${apiKey}:`).toString('base64');
    return {
        'Authorization': `Basic ${encodedKey}`,
        'Content-Type': 'application/json'
    };
}

// Searches the register by keyword or company name
export async function searchCompanies(query: string) {
    const url = new URL(`${BASE_URL}/search/companies`);
    url.searchParams.append('q', query);

    const response = await fetch(url.toString(), {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        console.error("CH API Error:", await response.text());
        throw new Error(`Companies House search request failed with status ${response.status}`);
    }

    return await response.json();
}

// Retrieves the profile of a company using its company number
export async function getCompanyProfile(companyNumber: string) {
    const response = await fetch(`${BASE_URL}/company/${companyNumber}`, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        console.error("CH API Profile Error:", await response.text());
        throw new Error(`Failed to retrieve profile for company ${companyNumber}`);
    }

    return await response.json();
}

// Retrieves the filing history
export async function getCompanyFilingHistory(companyNumber: string) {
    const response = await fetch(`${BASE_URL}/company/${companyNumber}/filing-history`, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to retrieve filing history for company ${companyNumber}`);
    }

    return await response.json();
}

// Retrieves the officers
export async function getCompanyOfficers(companyNumber: string) {
    const response = await fetch(`${BASE_URL}/company/${companyNumber}/officers`, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to retrieve officers for company ${companyNumber}`);
    }

    return await response.json();
}
