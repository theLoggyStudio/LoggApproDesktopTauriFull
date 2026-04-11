import { useState } from "react";

export default function AssuranceDto() {
  const [assurances, setAssurances] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/assurances');
    const data = await response.json();
    setAssurances(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/assurances/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newAssurance) => {
    await fetch('https://api.elephantsql.com/api/assurances', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newAssurance)
    });
  }

  const update = async (id, updatedAssurance) => {
    await fetch(`https://api.elephantsql.com/api/assurances/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedAssurance)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/assurances/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
