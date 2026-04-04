// screens/ContactsScreen.tsx — Emergency contact management screen.
//
// Lists all emergency contacts for the authenticated user and provides
// add, edit, and delete operations via a bottom-sheet modal.
//
// Data flow:
//   - On each focus (useFocusEffect): GET /contacts → refresh list
//   - Add: open empty modal → POST /contacts → refresh
//   - Edit: open modal pre-filled with existing data → PATCH /contacts/:id → refresh
//   - Delete: confirm alert → DELETE /contacts/:id → refresh
//
// The modal is shared between Add and Edit — the `editingContact` state determines
// which operation handleSave() performs. If editingContact is null, it's an add.
//
// useFocusEffect (not useEffect) is used so the list refreshes every time the user
// navigates back to this screen, not just on the first mount.

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

// Matches the shape returned by GET /contacts
interface Contact {
  id: number;         // DB primary key — used for update/delete calls
  name: string;
  phone_number: string;
}

export default function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null); // null = adding new
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Refresh the contacts list each time this screen gains focus.
  // This handles the case where the user navigates away and back (e.g. from HomeScreen).
  useFocusEffect(
    useCallback(() => {
      fetchContacts();
    }, []),
  );

  const fetchContacts = async () => {
    try {
      const res = await getContacts();
      // GET /contacts returns { contacts: [...] } — always 200, never 404 on empty
      setContacts(res.data?.contacts || []);
    } catch {
      Alert.alert('Error', 'Failed to load contacts.');
    }
  };

  // Open the modal in "add" mode — clear any previous edit state
  const openAdd = () => {
    setEditingContact(null);
    setName('');
    setPhone('');
    setModalVisible(true);
  };

  // Open the modal in "edit" mode — pre-fill with the selected contact's data
  const openEdit = (contact: Contact) => {
    setEditingContact(contact);
    setName(contact.name);
    setPhone(contact.phone_number);
    setModalVisible(true);
  };

  // handleSave — shared handler for both add and edit.
  // Checks editingContact to decide which API call to make.
  const handleSave = async () => {
    if (!name || !phone) {
      Alert.alert('Error', 'Name and phone number are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingContact) {
        // PATCH /contacts/:id — partial update, only sends changed fields
        await updateContact(editingContact.id, { name, phone_number: phone });
      } else {
        // POST /contacts — create a new contact
        await addContact({ name, phone_number: phone });
      }
      setModalVisible(false);
      fetchContacts(); // refresh the list after save
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to save contact.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  // handleDelete — shows a confirmation dialog before calling DELETE /contacts/:id
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
              fetchContacts(); // refresh list after deletion
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
