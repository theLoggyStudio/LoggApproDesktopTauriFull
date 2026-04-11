import { useState } from "react";

export default function PatientDto() {
  const [patients, setPatients] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/patients');
    const data = await response.json();
    setPatients(data);
    return data;
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/patients/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newPatient) => {
    await fetch('https://api.elephantsql.com/api/patients', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newPatient)
    });
  }

  const update = async (id, updatedPatient) => {
    await fetch(`https://api.elephantsql.com/api/patients/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedPatient)
    });
  }

  const remove = async (id) => {
    
    return await fetch(`https://api.elephantsql.com/api/patients/${id}`, {
      method: 'DELETE'
    });

  }

}
