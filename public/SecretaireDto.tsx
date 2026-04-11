import { useState } from "react";

export default function SecretaireDto() {
  const [secretaires, setSecretaires] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/secretaires');
    const data = await response.json();
    setSecretaires(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/secretaires/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newSecretaire) => {
    await fetch('https://api.elephantsql.com/api/secretaires', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newSecretaire)
    });
  }

  const update = async (id, updatedSecretaire) => {
    await fetch(`https://api.elephantsql.com/api/secretaires/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedSecretaire)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/secretaires/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
