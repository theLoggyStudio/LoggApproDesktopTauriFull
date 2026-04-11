import { useState } from "react";

export default function NomAssuranceDto() {
  const [nomAssurances, setNomAssurances] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/nomAssurances');
    const data = await response.json();
    setNomAssurances(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/nomAssurances/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newNomAssurance) => {
    await fetch('https://api.elephantsql.com/api/nomAssurances', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newNomAssurance)
    });
  }

  const update = async (id, updatedNomAssurance) => {
    await fetch(`https://api.elephantsql.com/api/nomAssurances/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedNomAssurance)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/nomAssurances/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
