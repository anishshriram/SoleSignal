import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addContact,
  deleteContact,
  getContacts,
  updateContact,
} from '../services/api';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Contacts'>;
};

interface Contact {
  id: number;
  name: string;
  phone_number: string;
}

export default function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchContacts();
    }, []),
  );

  const fetchContacts = async () => {
    try {
      const res = await getContacts();
      setContacts(res.data?.contacts || []);
    } catch {
      Alert.alert('Error', 'Failed to load contacts.');
    }
  };

  const openAdd = () => {
    setEditingContact(null);
    setName('');
    setPhone('');
    setModalVisible(true);
  };

  const openEdit = (contact: Contact) => {
    setEditingContact(contact);
    setName(contact.name);
    setPhone(contact.phone_number);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name || !phone) {
      Alert.alert('Error', 'Name and phone number are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingContact) {
        await updateContact(editingContact.id, { name, phone_number: phone });
      } else {
        await addContact({ name, phone_number: phone });
      }
      setModalVisible(false);
      fetchContacts();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to save contact.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (contact: Contact) => {
    Alert.alert(
      'Delete contact',
      `Remove ${contact.name} from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContact(contact.id);
              fetchContacts();
            } catch {
              Alert.alert('Error', 'Failed to delete contact.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Emergency contacts</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAdd}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {contacts.length === 0 && (
        <Text style={styles.empty}>
          No contacts yet. Add at least one emergency contact before using SoleSignal.
        </Text>
      )}

      <FlatList
        data={contacts}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactPhone}>{item.phone_number}</Text>
            </View>
            <TouchableOpacity onPress={() => openEdit(item)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {contacts.length > 0 && (
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.navigate('Home')}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingContact ? 'Edit contact' : 'Add contact'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={Colors.midGray}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={Colors.midGray}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[styles.saveButton, saving && styles.buttonDisabled]}>
                <Text style={styles.saveText}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heading: {
    ...Typography.heading,
    fontSize: 20,
  },
  addButton: {
    backgroundColor: Colors.scarlet,
    borderRadius: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  addButtonText: {
    color: Colors.white,
    fontWeight: '600',
  },
  empty: {
    color: Colors.midGray,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  rowInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', color: Colors.black },
  contactPhone: { fontSize: 14, color: Colors.midGray },
  editText: { color: Colors.scarlet, marginRight: Spacing.md, fontWeight: '600' },
  deleteText: { color: Colors.errorRed, fontWeight: '600' },
  doneButton: {
    backgroundColor: Colors.scarlet,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  doneButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.lg,
  },
  modalTitle: {
    ...Typography.subheading,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: 16,
    color: Colors.black,
    backgroundColor: Colors.lightGray,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
  },
  cancelButton: { padding: Spacing.md },
  cancelText: { color: Colors.midGray, fontSize: 16 },
  saveButton: {
    backgroundColor: Colors.scarlet,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  saveText: { color: Colors.white, fontWeight: '600', fontSize: 16 },
});
